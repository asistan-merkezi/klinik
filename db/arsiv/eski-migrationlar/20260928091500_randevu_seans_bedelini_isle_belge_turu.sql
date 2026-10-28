-- randevu_seans_bedelini_isle'a, Odeme Ekle formundaki yeni "Belgelendirme
-- Cinsi" alanini (fatura/fis/serbest) odeme satirina yazabilmesi icin
-- p_belge_turu parametresi eklendi (bkz. 20260928090000_hasta_bakiye_hareket_belge_turu.sql).
-- Trailing DEFAULT NULL parametre - eski cagrilar (parametre gondermeyenler)
-- calismaya devam eder. Fonksiyonun geri kalani 20260927150000'deki ile ayni.
CREATE OR REPLACE FUNCTION public.randevu_seans_bedelini_isle(
  p_randevu_id uuid,
  p_odeme_tutari numeric DEFAULT NULL,
  p_odeme_yontemi text DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_odeme_tarihi timestamptz DEFAULT NULL,
  p_belge_turu text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_zaten_islendi boolean;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin();
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum != 'tamamlandi' THEN
    RAISE EXCEPTION 'seans_tamamlanmamis';
  END IF;

  v_zaten_islendi := v_randevu.paket_satis_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc'
  );
  IF v_zaten_islendi THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

  SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
  v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, v_randevu.hasta_id);
  v_iskonto := LEAST(GREATEST(COALESCE(v_randevu.planlanan_iskonto_tutari, 0), 0), v_fiyat);

  INSERT INTO hasta_bakiye_hareket (
    klinik_id, hasta_id, tur, tutar, iskonto_tutari, iskonto_uygulayan_kullanici_id, randevu_id, aciklama
  )
  VALUES (
    v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_fiyat, v_iskonto,
    CASE WHEN v_iskonto > 0 THEN v_randevu.olusturan_kullanici_id ELSE NULL END,
    p_randevu_id,
    'Seans ücreti: ' || v_islem.ad
  );

  IF p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN
    IF p_odeme_yontemi IS NULL OR p_odeme_yontemi NOT IN ('nakit', 'kredi_karti', 'banka_havalesi') THEN
      RAISE EXCEPTION 'odeme_yontemi_gecersiz';
    END IF;
    IF p_belge_turu IS NOT NULL AND p_belge_turu NOT IN ('fatura', 'fis', 'serbest') THEN
      RAISE EXCEPTION 'belge_turu_gecersiz';
    END IF;

    INSERT INTO hasta_bakiye_hareket (
      klinik_id, hasta_id, tur, tutar, randevu_id, aciklama, odeme_yontemi, banka_hesap_id, belge_turu, created_at
    )
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'odeme', p_odeme_tutari, p_randevu_id, p_aciklama,
      p_odeme_yontemi, p_banka_hesap_id, p_belge_turu, COALESCE(p_odeme_tarihi, now())
    );
  END IF;

  RETURN jsonb_build_object(
    'yontem', CASE WHEN p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN 'odeme' ELSE 'cari' END,
    'hasta_id', v_randevu.hasta_id, 'tutar', v_fiyat, 'iskonto_tutari', v_iskonto
  );
END;
$function$;

-- Kontrol:
-- SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'randevu_seans_bedelini_isle';
