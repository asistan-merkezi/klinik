-- "Bakiye Hareketleri" tablosundaki açık (henüz kapanmamış) bir borç satırına
-- tıklanınca açılan düzenleme paneli için: iskonto uygulanabilir, faturalı
-- işaretlenebilir, ödeme tipi (nakit/kredi kartı/havale) seçilir — Kaydet
-- basılınca bu borcu GERÇEK bir ödemeyle kapatır (kullanıcı kararı: fatura
-- tablosu zaten sadece tamamlanmış bir ödemeye bağlanabiliyor, odeme_id NOT
-- NULL — bkz. 20260727150000_fatura_semasi.sql).
--
-- Denge/mahsup mantığı: borç satırının ORİJİNAL tutarı (kategori iskontosu
-- zaten uygulanmış hâliyle) kadar yeni bir 'kredi' hareketi yazılır — bu,
-- borcun -tutar etkisini tam olarak sıfırlar. İskonto (p_iskonto_tutari) sadece
-- FİİLEN TAHSİL EDİLEN tutarı (odeme_satiri) azaltır, bakiyede kalıntı borç
-- BIRAKMAZ (klinik tarafından verilen bir indirim/write-off olarak muhasebeleşir).
-- Orijinal borç satırı (append-only ledger felsefesiyle tutarlı — bkz.
-- 20260731110000) hiç güncellenmiyor/silinmiyor, sadece odeme_id alanı
-- kapatan ödemeye işaret edecek şekilde dolduruluyor (hangi ödemenin bu borcu
-- kapattığını izlemek + tekrar kapatılmasını engellemek için).

CREATE OR REPLACE FUNCTION public.hasta_bakiye_hareket_borc_kapat(
  p_hareket_id uuid,
  p_iskonto_tutari numeric,
  p_faturali boolean,
  p_yontem text,
  p_aciklama text
)
RETURNS uuid
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

  IF v_hareket.odeme_id IS NOT NULL THEN
    RAISE EXCEPTION 'zaten_kapatilmis';
  END IF;

  IF p_iskonto_tutari IS NULL OR p_iskonto_tutari < 0 THEN
    RAISE EXCEPTION 'iskonto_gecersiz';
  END IF;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  IF p_yontem NOT IN ('nakit', 'kredi_karti', 'banka_havalesi') THEN
    RAISE EXCEPTION 'gecersiz_odeme_tipi';
  END IF;

  -- Kalem açıklaması/KDV — borç bir randevudan geldiyse (normal check-in akışı)
  -- oradan; randevusuz (ör. arşivden içe aktarılmış) borçlarda serbest kalem.
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
  v_kalem_aciklama := COALESCE(v_kalem_aciklama, v_hareket.aciklama, 'Borç kapatma');

  SELECT * INTO v_hasta FROM hasta WHERE id = v_hareket.hasta_id;

  IF p_faturali THEN
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
  END IF;

  INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, v_hareket.hasta_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
  RETURNING id INTO v_odeme_id;

  INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani)
  VALUES (v_odeme_id, v_islem.id, v_kalem_aciklama, 1, v_hareket.tutar, v_kdv_orani);

  INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
  VALUES (v_odeme_id, p_yontem, v_net_toplam);

  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, randevu_id, aciklama)
  VALUES (
    v_klinik_id, v_hareket.hasta_id, 'kredi', v_hareket.tutar, v_odeme_id, v_hareket.randevu_id,
    'Borç kapatıldı: ' || v_kalem_aciklama
  );

  UPDATE hasta_bakiye_hareket SET odeme_id = v_odeme_id WHERE id = p_hareket_id;

  IF p_faturali THEN
    INSERT INTO fatura (klinik_id, odeme_id, durum)
    VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
  END IF;

  RETURN v_odeme_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hasta_bakiye_hareket_borc_kapat(uuid, numeric, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hasta_bakiye_hareket_borc_kapat(uuid, numeric, boolean, text, text) TO authenticated;
