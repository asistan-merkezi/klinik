-- Detaylı müşteri kaydı: musteri'ye cinsiyet/eposta/referans_kanali + iki yeni
-- rıza zaman damgası (ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi)
-- eklenir. Hassas veriler (kimlik no, adres, acil durum kişisi, tıbbi geçmiş)
-- ayrı musteri_hassas tablosunda tutulur (kullanıcı kararı: pgcrypto şifreleme
-- yok, izolasyon RLS + Supabase disk-seviyesi şifrelemeyle sağlanıyor).
-- İdempotent, tek blok.

-- 1) musteri: yeni kolonlar
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS cinsiyet text CHECK (cinsiyet IN ('kadin', 'erkek', 'belirtilmemis'));
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS eposta text;
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS referans_kanali text;
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS ozel_nitelikli_veri_onay_tarihi timestamptz;
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS ticari_ileti_onay_tarihi timestamptz;

-- 2) musteri_hassas (1-1; musteri_id PK, klinik_ayarlar deseniyle tutarlı)
CREATE TABLE IF NOT EXISTS musteri_hassas (
  musteri_id uuid PRIMARY KEY REFERENCES musteri(id) ON DELETE CASCADE,
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kimlik_no text,
  kimlik_no_tipi text CHECK (kimlik_no_tipi IN ('tc', 'pasaport')),
  adres text,
  acil_durum_ad_soyad text,
  acil_durum_yakinlik text,
  acil_durum_telefon text,
  kronik_hastaliklar text,
  surekli_ilaclar text,
  alerjiler text,
  gecirilmis_ameliyatlar text,
  gelis_sebebi text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_hassas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_hassas_klinik_id ON musteri_hassas(klinik_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_hassas_kimlik_no ON musteri_hassas(klinik_id, kimlik_no) WHERE kimlik_no IS NOT NULL;

DROP TRIGGER IF EXISTS trg_musteri_hassas_updated_at ON musteri_hassas;
CREATE TRIGGER trg_musteri_hassas_updated_at
  BEFORE UPDATE ON musteri_hassas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- klinik_id her zaman musteri'den türetilir; INSERT'te client'ın gönderdiği
-- değere güvenilmez (randevu_iptal_talebi'ndeki desenle tutarlı).
CREATE OR REPLACE FUNCTION musteri_hassas_klinik_id_ata()
RETURNS trigger AS $$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM musteri WHERE id = NEW.musteri_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_musteri_hassas_klinik_id ON musteri_hassas;
CREATE TRIGGER trg_musteri_hassas_klinik_id
  BEFORE INSERT ON musteri_hassas
  FOR EACH ROW EXECUTE FUNCTION musteri_hassas_klinik_id_ata();

-- 3) RLS: görüntüleme tüm klinik üyeleri (klinik tedavi güvenliği — alerji/kronik
-- hastalık her terapiste görünür olmalı) + müşterinin kendi portalı;
-- yönetim klinik_admin/resepsiyon + müşterinin kendi portalı (self-servis anamnez).
DROP POLICY IF EXISTS "musteri_hassas_select" ON musteri_hassas;
CREATE POLICY "musteri_hassas_select" ON musteri_hassas
  FOR SELECT USING (
    klinik_id = current_klinik_id() OR musteri_id = current_musteri_id() OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_hassas_insert" ON musteri_hassas;
CREATE POLICY "musteri_hassas_insert" ON musteri_hassas
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon'))
    OR musteri_id = current_musteri_id()
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_hassas_update" ON musteri_hassas;
CREATE POLICY "musteri_hassas_update" ON musteri_hassas
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon'))
    OR musteri_id = current_musteri_id()
    OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon'))
    OR musteri_id = current_musteri_id()
    OR is_super_admin()
  );

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'musteri' AND column_name IN
--   ('cinsiyet','eposta','referans_kanali','ozel_nitelikli_veri_onay_tarihi','ticari_ileti_onay_tarihi');
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'musteri_hassas';
