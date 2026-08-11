-- Kullanıcı sistemi baştan tarif etti (en basit hâli): "borç gelir, borç
-- satırına tıklanınca iskonto/faturalı girilir, iskonto o satırda gösterilir
-- ve bakiye iskonto uygulanmış olarak yazılır — borç kapama SİSTEMİ (ayrı
-- 'ödeme' satırı, 'Ödendi' durumu, idempotency) OLMAYACAK." Bu migration
-- önceki iki-satırlı Borç Kapatma tasarımını (20260813120000) tamamen
-- kaldırıp yerine tek-satırlı, durumsuz bir "borç düzenleme" getiriyor.

-- 1) İskonto artık borç satırının kendi kolonu — bir odeme kaydına bağlı
--    değil, her zaman erişilebilir/düzenlenebilir.
ALTER TABLE hasta_bakiye_hareket ADD COLUMN IF NOT EXISTS iskonto_tutari numeric NOT NULL DEFAULT 0;

-- 2) Veri düzeltmesi: önceki tasarımla kapatılmış borç+ödeme çiftlerini tek
--    satıra geri kavuşturuyoruz — borç satırı ödemenin iskonto_tutari'sini
--    devralıyor (odeme_id linki, dolayısıyla fatura bağlantısı KORUNUYOR),
--    ayrı "ödeme" satırı (randevu_id dolu olan, borç kapatmanın izi) siliniyor.
UPDATE hasta_bakiye_hareket b
SET iskonto_tutari = o.iskonto_tutari
FROM odeme o
WHERE b.tur = 'borc' AND b.odeme_id = o.id;

DELETE FROM hasta_bakiye_hareket WHERE tur = 'odeme' AND randevu_id IS NOT NULL;

-- 3) Eski "borç kapatma" RPC'si kaldırıldı, yerine durumsuz bir "düzenleme"
--    fonksiyonu geldi: sadece iskonto_tutari'yi güncelliyor; faturalı
--    işaretlenirse (kullanıcı seçimiyle) mevcut fatura/odeme altyapısı
--    yeniden kullanılıyor ama bu artık "kapatma" değil, sıradan bir
--    düzenleme — satır her zaman 'borc' kalıyor, ne zaman istenirse tekrar
--    düzenlenebilir, "Ödendi" gibi bir durum/rozet YOK.
DROP FUNCTION IF EXISTS public.hasta_bakiye_hareket_borc_kapat(uuid, numeric, boolean, text, text);

CREATE OR REPLACE FUNCTION public.hasta_bakiye_hareket_borc_duzenle(
  p_hareket_id uuid,
  p_iskonto_tutari numeric,
  p_faturali boolean,
  p_aciklama text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_klinik_id uuid;
  v_hareket hasta_bakiye_hareket%ROWTYPE;
  v_randevu randevu%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_kalem_aciklama text;
  v_kdv_orani numeric := 0;
  v_net_toplam numeric;
  v_odeme_id uuid;
  v_hasta hasta%ROWTYPE;
  v_kimlik_var boolean;
  v_adres_var boolean;
  v_eksikler text[] := '{}';
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_hareket FROM hasta_bakiye_hareket
    WHERE id = p_hareket_id AND klinik_id = v_klinik_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hareket_bulunamadi';
  END IF;

  IF v_hareket.tur <> 'borc' THEN
    RAISE EXCEPTION 'gecersiz_hareket_turu';
  END IF;

  IF p_iskonto_tutari IS NULL OR p_iskonto_tutari < 0 THEN
    RAISE EXCEPTION 'iskonto_gecersiz';
  END IF;

  IF p_iskonto_tutari > v_hareket.tutar THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  -- İskonto her zaman doğrudan borç satırının kendisine yazılıyor.
  UPDATE hasta_bakiye_hareket
  SET iskonto_tutari = p_iskonto_tutari,
      aciklama = COALESCE(NULLIF(p_aciklama, ''), aciklama)
  WHERE id = p_hareket_id;

  IF NOT p_faturali THEN
    RETURN;
  END IF;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;

  IF v_hareket.randevu_id IS NOT NULL THEN
    SELECT * INTO v_randevu FROM randevu WHERE id = v_hareket.randevu_id;
    IF FOUND AND v_randevu.islem_tanimi_id IS NOT NULL THEN
      SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
      IF FOUND THEN
        v_kalem_aciklama := v_islem.ad;
        v_kdv_orani := v_islem.kdv_orani;
      END IF;
    END IF;
  END IF;
  v_kalem_aciklama := COALESCE(v_kalem_aciklama, v_hareket.aciklama, 'Borç');

  SELECT * INTO v_hasta FROM hasta WHERE id = v_hareket.hasta_id;

  SELECT (kimlik_no IS NOT NULL AND kimlik_no <> ''), (adres IS NOT NULL AND adres <> '')
    INTO v_kimlik_var, v_adres_var
    FROM hasta_hassas WHERE hasta_id = v_hareket.hasta_id;

  IF v_hasta.ad_soyad IS NULL OR v_hasta.ad_soyad = '' THEN
    v_eksikler := array_append(v_eksikler, 'ad_soyad');
  END IF;
  IF v_hasta.eposta IS NULL OR v_hasta.eposta = '' THEN
    v_eksikler := array_append(v_eksikler, 'eposta');
  END IF;
  IF NOT COALESCE(v_adres_var, false) THEN
    v_eksikler := array_append(v_eksikler, 'adres');
  END IF;
  IF NOT COALESCE(v_kimlik_var, false) THEN
    v_eksikler := array_append(v_eksikler, 'kimlik_no');
  END IF;

  IF array_length(v_eksikler, 1) > 0 THEN
    RAISE EXCEPTION 'fatura_bilgisi_eksik: %', array_to_string(v_eksikler, ',');
  END IF;

  -- Bu borç satırı daha önce faturalandırılmışsa (odeme_id zaten dolu),
  -- yeni bir fatura DAHA açmıyoruz — mevcut kaydı güncel iskontoyla senkron
  -- tutuyoruz (yeniden düzenlenebilir olduğu için).
  IF v_hareket.odeme_id IS NOT NULL THEN
    UPDATE odeme SET iskonto_tutari = p_iskonto_tutari, aciklama = COALESCE(NULLIF(p_aciklama, ''), aciklama)
      WHERE id = v_hareket.odeme_id;
    UPDATE odeme_satiri SET tutar = v_net_toplam WHERE odeme_id = v_hareket.odeme_id;
    RETURN;
  END IF;

  INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, v_hareket.hasta_id, auth.uid(), p_iskonto_tutari, true, p_aciklama)
  RETURNING id INTO v_odeme_id;

  INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani)
  VALUES (v_odeme_id, v_islem.id, v_kalem_aciklama, 1, v_hareket.tutar, v_kdv_orani);

  -- Bu diyalog ödeme yöntemi sormuyor (o sadece "Ödeme Ekle"de var) — sabit
  -- 'nakit' sadece odeme_satiri.yontem NOT NULL kısıtını + Faturalar
  -- ekranının tutar toplamını (odeme_satiri.tutar) doğru besliyor.
  INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
  VALUES (v_odeme_id, 'nakit', v_net_toplam);

  UPDATE hasta_bakiye_hareket SET odeme_id = v_odeme_id WHERE id = p_hareket_id;

  INSERT INTO fatura (klinik_id, odeme_id, durum)
  VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
END;
$function$;
