-- Tedavi Tanımları yeniden yapılandırması: bir tedavi artık tek düz kayıt değil,
-- birden çok "işlem adımı"ndan oluşuyor (her adımın kendi adı/gerekli cihazı/
-- süresi var). Fiyat/KDV/muhasebe hizmet ismi tedavi (üst) seviyede kalıyor.
--
-- Desen: tedavi_protokolu/tedavi_protokolu_adimi ile birebir aynı üst-alt yapı
-- (bkz. 20260731140000_tedavi_protokolu_semasi.sql) — klinik_id client'tan
-- gelmez, derive_klinik_id_from_parent() ile türetilir.
--
-- islem_tanimi.gerekli_cihaz_id/sure_dakika bugüne kadar bu modül DIŞINDA
-- sadece randevu formunda "süre otomatik doldur" için okunuyordu (randevunun
-- kendi cihaz_id'si ayrı, çakışma kısıtı buna bağlı değil) — bu yüzden
-- sure_dakika'yı "toplam süre" olarak DENORMALİZE EDİP trigger'la güncel
-- tutuyoruz (randevu formu dahil hiçbir tüketici dosyaya dokunmaya gerek
-- kalmıyor), gerekli_cihaz_id ise artık anlamsız olduğu için tamamen kalkıyor.

-- ==================== 1) islem_tanimi_adim ====================
CREATE TABLE IF NOT EXISTS islem_tanimi_adim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE CASCADE,
  ad text NOT NULL,
  gerekli_cihaz_id uuid REFERENCES cihaz(id) ON DELETE SET NULL,
  sure_dakika integer CHECK (sure_dakika IS NULL OR sure_dakika >= 1),
  sira integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE islem_tanimi_adim ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_adim_klinik_id ON islem_tanimi_adim(klinik_id);
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_adim_islem_id ON islem_tanimi_adim(islem_tanimi_id);

DROP TRIGGER IF EXISTS trg_islem_tanimi_adim_updated_at ON islem_tanimi_adim;
CREATE TRIGGER trg_islem_tanimi_adim_updated_at
  BEFORE UPDATE ON islem_tanimi_adim FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_islem_tanimi_adim_klinik_id ON islem_tanimi_adim;
CREATE TRIGGER trg_islem_tanimi_adim_klinik_id
  BEFORE INSERT ON islem_tanimi_adim
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('islem_tanimi', 'islem_tanimi_id');

DROP POLICY IF EXISTS "islem_tanimi_adim_select_klinik" ON islem_tanimi_adim;
CREATE POLICY "islem_tanimi_adim_select_klinik" ON islem_tanimi_adim
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "islem_tanimi_adim_yonet_admin" ON islem_tanimi_adim;
CREATE POLICY "islem_tanimi_adim_yonet_admin" ON islem_tanimi_adim
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ==================== 2) Toplam süre denormalizasyonu ====================
CREATE OR REPLACE FUNCTION islem_tanimi_toplam_sure_guncelle()
RETURNS trigger AS $$
DECLARE
  v_islem_id uuid := COALESCE(NEW.islem_tanimi_id, OLD.islem_tanimi_id);
BEGIN
  UPDATE islem_tanimi
    SET sure_dakika = (SELECT SUM(sure_dakika) FROM islem_tanimi_adim WHERE islem_tanimi_id = v_islem_id)
    WHERE id = v_islem_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_islem_tanimi_adim_toplam_sure ON islem_tanimi_adim;
CREATE TRIGGER trg_islem_tanimi_adim_toplam_sure
  AFTER INSERT OR UPDATE OR DELETE ON islem_tanimi_adim
  FOR EACH ROW EXECUTE FUNCTION islem_tanimi_toplam_sure_guncelle();

-- ==================== 3) Backfill (mevcut tedaviler → tek adım) ====================
INSERT INTO islem_tanimi_adim (klinik_id, islem_tanimi_id, ad, gerekli_cihaz_id, sure_dakika, sira)
SELECT it.klinik_id, it.id, it.ad, it.gerekli_cihaz_id, it.sure_dakika, 1
FROM islem_tanimi it
WHERE NOT EXISTS (SELECT 1 FROM islem_tanimi_adim a WHERE a.islem_tanimi_id = it.id);

-- ==================== 4) gerekli_cihaz_id artık islem_tanimi'nde anlamsız ====================
ALTER TABLE islem_tanimi DROP COLUMN IF EXISTS gerekli_cihaz_id;

-- ==================== 5) Atomik kaydetme RPC'si ====================
-- Tek çağrıda hem tedavi (islem_tanimi) satırını hem adım listesini senkronlar:
-- gönderilen id'ler UPDATE, id'siz olanlar INSERT, artık gönderilmeyen mevcut
-- adım id'leri DELETE edilir (odeme_olustur ile aynı jsonb-array deseni).
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
        sure_dakika = NULLIF(v_adim->>'sure_dakika', '')::integer,
        sira = v_sira
      WHERE id = (v_adim->>'id')::uuid AND islem_tanimi_id = v_islem_id
      RETURNING id INTO v_adim_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'adim_bulunamadi';
      END IF;
    ELSE
      INSERT INTO islem_tanimi_adim (islem_tanimi_id, ad, gerekli_cihaz_id, sure_dakika, sira)
      VALUES (
        v_islem_id,
        v_adim->>'ad',
        NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
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

REVOKE ALL ON FUNCTION islem_tanimi_kaydet(uuid, text, numeric, numeric, numeric, numeric, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION islem_tanimi_kaydet(uuid, text, numeric, numeric, numeric, numeric, numeric, text, jsonb) TO authenticated;

-- Kontrol:
-- SELECT it.ad, it.sure_dakika, count(a.id) FROM islem_tanimi it LEFT JOIN islem_tanimi_adim a ON a.islem_tanimi_id = it.id GROUP BY it.id, it.ad, it.sure_dakika;
-- SELECT policyname FROM pg_policies WHERE tablename = 'islem_tanimi_adim';
