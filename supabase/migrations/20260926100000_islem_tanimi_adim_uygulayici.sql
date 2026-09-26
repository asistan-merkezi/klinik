-- Her işlem adımına opsiyonel "uygulayıcı" (hangi pozisyon/rol yapar, örn.
-- Fizyoterapist/Masör) eklendi — mevcut `pozisyonlar` kataloğu (klinik bazlı,
-- 20260819100000_pozisyonlar.sql) referans alınıyor, "Gerekli Cihaz"ın `cihaz`
-- kataloğunu referans alma deseniyle birebir aynı.

ALTER TABLE islem_tanimi_adim
  ADD COLUMN IF NOT EXISTS uygulayici_pozisyon_id uuid REFERENCES pozisyonlar(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_islem_tanimi_adim_uygulayici_pozisyon_id
  ON islem_tanimi_adim(uygulayici_pozisyon_id);

-- islem_tanimi_kaydet: imza aynı kalıyor (p_adimlar jsonb), sadece adım
-- insert/update gövdesine uygulayici_pozisyon_id eklendi.
CREATE OR REPLACE FUNCTION islem_tanimi_kaydet(
  p_id uuid,
  p_ad text,
  p_vita_fiyat numeric,
  p_plus_fiyat numeric,
  p_elit_fiyat numeric,
  p_prime_fiyat numeric,
  p_kdv_orani numeric,
  p_muhasebe_hizmet_ismi text,
  p_adimlar jsonb
)
RETURNS uuid AS $$
DECLARE
  v_klinik_id uuid;
  v_islem_id uuid;
  v_adim jsonb;
  v_sira integer := 0;
  v_gonderilen_id_listesi uuid[] := '{}';
  v_adim_id uuid;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_adimlar IS NULL OR jsonb_array_length(p_adimlar) = 0 THEN
    RAISE EXCEPTION 'adim_gerekli';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO islem_tanimi
      (klinik_id, ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi)
    VALUES
      (v_klinik_id, p_ad, p_vita_fiyat, p_plus_fiyat, p_elit_fiyat, p_prime_fiyat, p_kdv_orani, p_muhasebe_hizmet_ismi)
    RETURNING id INTO v_islem_id;
  ELSE
    UPDATE islem_tanimi SET
      ad = p_ad,
      vita_fiyat = p_vita_fiyat,
      plus_fiyat = p_plus_fiyat,
      elit_fiyat = p_elit_fiyat,
      prime_fiyat = p_prime_fiyat,
      kdv_orani = p_kdv_orani,
      muhasebe_hizmet_ismi = p_muhasebe_hizmet_ismi
    WHERE id = p_id AND klinik_id = v_klinik_id
    RETURNING id INTO v_islem_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tedavi_bulunamadi';
    END IF;
  END IF;

  FOR v_adim IN SELECT * FROM jsonb_array_elements(p_adimlar)
  LOOP
    v_sira := v_sira + 1;

    IF NULLIF(v_adim->>'id', '') IS NOT NULL THEN
      UPDATE islem_tanimi_adim SET
        ad = v_adim->>'ad',
        gerekli_cihaz_id = NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        uygulayici_pozisyon_id = NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        sure_dakika = NULLIF(v_adim->>'sure_dakika', '')::integer,
        sira = v_sira
      WHERE id = (v_adim->>'id')::uuid AND islem_tanimi_id = v_islem_id
      RETURNING id INTO v_adim_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'adim_bulunamadi';
      END IF;
    ELSE
      INSERT INTO islem_tanimi_adim (islem_tanimi_id, ad, gerekli_cihaz_id, uygulayici_pozisyon_id, sure_dakika, sira)
      VALUES (
        v_islem_id,
        v_adim->>'ad',
        NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        NULLIF(v_adim->>'sure_dakika', '')::integer,
        v_sira
      )
      RETURNING id INTO v_adim_id;
    END IF;

    v_gonderilen_id_listesi := v_gonderilen_id_listesi || v_adim_id;
  END LOOP;

  DELETE FROM islem_tanimi_adim
  WHERE islem_tanimi_id = v_islem_id AND NOT (id = ANY(v_gonderilen_id_listesi));

  RETURN v_islem_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'islem_tanimi_adim' AND column_name = 'uygulayici_pozisyon_id';
