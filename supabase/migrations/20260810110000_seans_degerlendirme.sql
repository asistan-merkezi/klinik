-- Seans Sonu Anket ve Puanlama: her randevuya özel, dinamik bir QR ile hasta
-- kendi telefonundan 1-5 puan + öneri metni girebiliyor, yanıt otomatik o
-- randevu+hastaya bağlanıyor. randevu.id (UUID v4, tahmin edilemez) doğrudan
-- URL'de kullanılıyor — anket_yaniti/hasta ön kayıt akışlarındaki gibi ayrı
-- bir token kolonu gerekmiyor, UNIQUE(randevu_id) ikinci kez doldurmayı zaten
-- DB seviyesinde engelliyor.

CREATE TABLE IF NOT EXISTS seans_degerlendirme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL UNIQUE REFERENCES randevu(id) ON DELETE CASCADE,
  hasta_id uuid NOT NULL REFERENCES hasta(id) ON DELETE CASCADE,
  puan smallint CHECK (puan BETWEEN 1 AND 5),
  oneri_metni text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seans_degerlendirme_bos_olamaz CHECK (puan IS NOT NULL OR oneri_metni IS NOT NULL)
);
ALTER TABLE seans_degerlendirme ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_seans_degerlendirme_klinik_id ON seans_degerlendirme(klinik_id);
CREATE INDEX IF NOT EXISTS idx_seans_degerlendirme_hasta_id ON seans_degerlendirme(hasta_id);

-- klinik_id + hasta_id randevu'dan türetiliyor (derive_klinik_id_from_parent
-- tek kolon türetiyor, burada 2 kolon gerektiği için küçük özel bir trigger).
-- Anon insert edeceği için client bu iki alanı hiç göndermiyor/gönderemiyor.
CREATE OR REPLACE FUNCTION seans_degerlendirme_alanlari_doldur()
RETURNS trigger AS $$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = NEW.randevu_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;
  NEW.klinik_id := v_randevu.klinik_id;
  NEW.hasta_id := v_randevu.hasta_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_seans_degerlendirme_alanlari_doldur ON seans_degerlendirme;
CREATE TRIGGER trg_seans_degerlendirme_alanlari_doldur
  BEFORE INSERT ON seans_degerlendirme
  FOR EACH ROW EXECUTE FUNCTION seans_degerlendirme_alanlari_doldur();

-- anon'un randevu tablosunda SELECT policy'si yok — düz bir EXISTS alt
-- sorgusu RLS'e takılıp her zaman false dönerdi (hasta_qr_self_servis_mi'de
-- daha önce bulunan derste olduğu gibi, bkz. 20260804110000). SECURITY
-- DEFINER ile bypass edilip sadece "bu randevu anket almaya uygun mu" bilgisi
-- dışarı sızdırılıyor.
CREATE OR REPLACE FUNCTION randevu_anket_uygun_mu(p_randevu_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM randevu
    WHERE id = p_randevu_id AND durum IN ('tamamlandi', 'geldi', 'gecikmeli_geldi')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION randevu_anket_uygun_mu(uuid) TO anon, authenticated;

-- Anket sayfası açılırken (anon) klinik adını göstermek ve "zaten yanıtlandı
-- mı" bilgisini vermek için — klinik_qr_bilgisi_getir'in randevu-bazlı
-- varyantı, aynı desen (sadece görüntü amaçlı, hassas alan döndürmüyor).
CREATE OR REPLACE FUNCTION seans_degerlendirme_baglam_getir(p_randevu_id uuid)
RETURNS TABLE(klinik_ad text, zaten_dolduruldu boolean) AS $$
  SELECT k.ad, EXISTS (SELECT 1 FROM seans_degerlendirme sd WHERE sd.randevu_id = p_randevu_id)
  FROM randevu r
  JOIN klinik k ON k.id = r.klinik_id
  WHERE r.id = p_randevu_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION seans_degerlendirme_baglam_getir(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "seans_degerlendirme_select_admin" ON seans_degerlendirme;
CREATE POLICY "seans_degerlendirme_select_admin" ON seans_degerlendirme
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "seans_degerlendirme_insert_anon" ON seans_degerlendirme;
CREATE POLICY "seans_degerlendirme_insert_anon" ON seans_degerlendirme
  FOR INSERT TO anon WITH CHECK (randevu_anket_uygun_mu(randevu_id));

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'seans_degerlendirme';
-- SELECT proname FROM pg_proc WHERE proname LIKE '%seans_degerlendirme%' OR proname = 'randevu_anket_uygun_mu';
