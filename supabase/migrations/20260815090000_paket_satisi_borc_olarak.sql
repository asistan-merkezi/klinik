-- Paket satışı artık peşin ödeme olarak değil, hasta_bakiye_hareket'e BORÇ
-- olarak işleniyor (kullanıcı kararı, 2026-08-15): "paketler eklenince
-- bakiye hareketlerine borç olarak eklensin, ödeme girilmesin." Paket
-- satışında artık hiç `odeme`/`odeme_kalemi`/`odeme_satiri` kaydı
-- OLUŞMUYOR (paket_satis.odeme_id NULL kalıyor) — sadece
-- hasta_bakiye_hareket'e tur='borc' bir satır yazılıyor, tıpkı randevu
-- check-in'in ürettiği borç satırı gibi (aynı `hasta_bakiye_hareket_borc_duzenle`
-- akışıyla sonradan iskonto/fatura uygulanabiliyor — o RPC zaten randevu_id'si
-- olmayan borç satırlarını genel olarak destekliyordu, buna dokunulmadı).
-- Dialogda girilen iskonto bu turda da satış anında borcun kendi
-- iskonto_tutari kolonuna yazılıyor (borç satırına tıklanıp sonradan da
-- değiştirilebilir, diğer borç satırlarıyla aynı desen).
--
-- `islem` türü kalemler (şu an panelde hiçbir UI'dan çağrılmıyor, ileride
-- işlem satışı geri bağlanırsa diye kod korunuyor) eski peşin-ödeme
-- davranışını AYNEN koruyor — bu değişiklik sadece SADECE paket kalemi
-- içeren (işlem kalemi hiç olmayan) çağrılara uygulanıyor.
CREATE OR REPLACE FUNCTION public.odeme_olustur(p_hasta_id uuid, p_iskonto_tutari numeric, p_faturali boolean, p_aciklama text, p_kalemler jsonb, p_satirlar jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_odeme_id uuid;
  v_kalem jsonb;
  v_satir jsonb;
  v_islem islem_tanimi%ROWTYPE;
  v_paket paket%ROWTYPE;
  v_paket_satis_id uuid;
  v_miktar integer;
  v_fiyat numeric;
  v_kalem_toplam numeric := 0;
  v_satir_toplam numeric := 0;
  v_net_toplam numeric;
  v_katilimci_sayisi integer;
  v_var_islem boolean := false;
  v_paket_adlari text[] := '{}';
  v_borc_id uuid;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'hasta_bulunamadi';
  END IF;

  -- İçinde işlem kalemi var mı önceden belirleniyor — varsa eski peşin
  -- ödeme yoluna, yoksa (sadece paket) yeni borç yoluna gidiliyor.
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    IF v_kalem->>'tur' = 'islem' THEN
      v_var_islem := true;
    END IF;
  END LOOP;

  IF v_var_islem THEN
    INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
    VALUES (v_klinik_id, p_hasta_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
    RETURNING id INTO v_odeme_id;
  END IF;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_miktar := GREATEST(COALESCE((v_kalem->>'miktar')::integer, 1), 1);

    IF v_kalem->>'tur' = 'islem' THEN
      SELECT * INTO v_islem FROM islem_tanimi
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, p_hasta_id);

      INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_islem.id, v_miktar, v_fiyat, v_islem.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_fiyat * v_miktar;

    ELSIF v_kalem->>'tur' = 'paket' THEN
      SELECT * INTO v_paket FROM paket
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif
          AND (satis_bitis_tarihi IS NULL OR satis_bitis_tarihi >= current_date);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      IF v_paket.kisi_kotasi IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM paket_satis WHERE paket_id = v_paket.id AND hasta_id = p_hasta_id)
      THEN
        SELECT count(DISTINCT hasta_id) INTO v_katilimci_sayisi
          FROM paket_satis WHERE paket_id = v_paket.id AND durum = 'aktif';
        IF v_katilimci_sayisi >= v_paket.kisi_kotasi THEN
          RAISE EXCEPTION 'kota_doldu';
        END IF;
      END IF;

      -- v_var_islem=false iken v_odeme_id hiç atanmamış (NULL) olarak
      -- kalıyor — paket_satis.odeme_id nullable, bilinçli olarak boş bırakılıyor.
      INSERT INTO paket_satis (klinik_id, hasta_id, paket_id, odeme_id, kalan_adet)
      VALUES (v_klinik_id, p_hasta_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi)
      RETURNING id INTO v_paket_satis_id;

      v_paket_adlari := array_append(v_paket_adlari, v_paket.ad);

      IF v_var_islem THEN
        INSERT INTO odeme_kalemi (odeme_id, paket_satis_id, miktar, birim_fiyat, kdv_orani)
        VALUES (v_odeme_id, v_paket_satis_id, 1, v_paket.fiyat, v_paket.kdv_orani);
      END IF;

      v_kalem_toplam := v_kalem_toplam + v_paket.fiyat;

    ELSE
      RAISE EXCEPTION 'gecersiz_kalem_turu';
    END IF;
  END LOOP;

  IF v_kalem_toplam = 0 THEN
    RAISE EXCEPTION 'kalem_yok';
  END IF;

  v_net_toplam := v_kalem_toplam - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  IF v_var_islem THEN
    FOR v_satir IN SELECT * FROM jsonb_array_elements(p_satirlar)
    LOOP
      INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
      VALUES (v_odeme_id, v_satir->>'yontem', (v_satir->>'tutar')::numeric);

      v_satir_toplam := v_satir_toplam + (v_satir->>'tutar')::numeric;
    END LOOP;

    IF v_satir_toplam <> v_net_toplam THEN
      RAISE EXCEPTION 'odeme_tutari_uyusmuyor';
    END IF;

    INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, aciklama)
    VALUES (v_klinik_id, p_hasta_id, 'odeme', v_net_toplam, v_odeme_id, p_aciklama);

    IF p_faturali THEN
      INSERT INTO fatura (klinik_id, odeme_id, durum)
      VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
    END IF;

    RETURN v_odeme_id;
  END IF;

  -- Sadece paket satışı: p_satirlar tamamen YOK SAYILIYOR (ödeme girilmiyor)
  -- — bunun yerine borç satırı ekleniyor, iskonto satırın kendi
  -- iskonto_tutari kolonunda, "Borç Satırını Düzenle" ile sonradan (iskonto/
  -- fatura) yeniden düzenlenebilir.
  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, iskonto_tutari, aciklama)
  VALUES (
    v_klinik_id, p_hasta_id, 'borc', v_kalem_toplam, p_iskonto_tutari,
    COALESCE(NULLIF(p_aciklama, ''), array_to_string(v_paket_adlari, ', '))
  )
  RETURNING id INTO v_borc_id;

  RETURN v_borc_id;
END;
$function$;

-- Kontrol:
-- SELECT prosrc FROM pg_proc WHERE proname = 'odeme_olustur';
