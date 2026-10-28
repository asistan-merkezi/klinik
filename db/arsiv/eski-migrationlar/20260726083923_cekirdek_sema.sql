-- Klinik Asistanı — Çekirdek Şema (Sprint 1 alt kümesi)
-- klinik (tenant), kullanici/rol, personel/terapist, musteri, oda/cihaz, randevu (+ çakışma kontrolü),
-- klinik_ayarlar, audit_log, current_klinik_id() helper + RLS. İdempotent, tek blok.

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Enum tipleri
DO $$ BEGIN
  CREATE TYPE kullanici_rol_tipi AS ENUM ('super_admin', 'klinik_admin', 'resepsiyon', 'terapist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE randevu_durum_tipi AS ENUM ('planlandi', 'geldi', 'iptal', 'gelmedi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) klinik (tenant)
CREATE TABLE IF NOT EXISTS klinik (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad text NOT NULL,
  subdomain text UNIQUE,
  plan_turu text NOT NULL DEFAULT 'starter' CHECK (plan_turu IN ('starter', 'pro', 'enterprise')),
  plan_bitis_tarihi date,
  logo_url text,
  marka_renkleri jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik ENABLE ROW LEVEL SECURITY;

-- 3) kullanici (auth.users ile 1-1; super_admin haricinde klinik_id zorunlu)
CREATE TABLE IF NOT EXISTS kullanici (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,
  rol kullanici_rol_tipi NOT NULL,
  ad_soyad text NOT NULL,
  telefon text,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kullanici_klinik_gerekli CHECK (rol = 'super_admin' OR klinik_id IS NOT NULL)
);
ALTER TABLE kullanici ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kullanici_klinik_id ON kullanici(klinik_id);

-- 4) Helper fonksiyonlar (RLS policy'lerinde kullanılır; kullanici tablosunu
-- SECURITY DEFINER ile RLS'i bypass ederek okurlar — döngüsel bağımlılık olmaz)
CREATE OR REPLACE FUNCTION current_klinik_id()
RETURNS uuid AS $$
  SELECT klinik_id FROM kullanici WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION current_rol()
RETURNS kullanici_rol_tipi AS $$
  SELECT rol FROM kullanici WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT current_rol() = 'super_admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 5) Ortak updated_at trigger fonksiyonu
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6) personel (tüm çalışanlar)
CREATE TABLE IF NOT EXISTS personel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  ad_soyad text NOT NULL,
  gorev text NOT NULL,
  maas numeric(12, 2),
  ise_giris_tarihi date,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE personel ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_klinik_id ON personel(klinik_id);

-- 7) terapist (personelin terapist rolündeki alt kümesi)
CREATE TABLE IF NOT EXISTS terapist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL UNIQUE REFERENCES personel(id) ON DELETE CASCADE,
  maas_hesaplama_modeli text NOT NULL DEFAULT 'sabit'
    CHECK (maas_hesaplama_modeli IN ('sabit', 'islem_basi_prim', 'barajli_prim')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE terapist ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_terapist_klinik_id ON terapist(klinik_id);

-- 8) musteri (hasta kaydı — temel alanlar, hassas alanlar sonraki turda)
CREATE TABLE IF NOT EXISTS musteri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL,
  telefon text NOT NULL,
  dogum_tarihi date,
  kvkk_onay_tarihi timestamptz,
  whatsapp_izin_durumu boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_klinik_id ON musteri(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_telefon ON musteri(telefon);

-- 9) oda
CREATE TABLE IF NOT EXISTS oda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE oda ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_oda_klinik_id ON oda(klinik_id);

-- 10) cihaz
CREATE TABLE IF NOT EXISTS cihaz (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cihaz ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cihaz_klinik_id ON cihaz(klinik_id);

-- 11) randevu (oda+terapist+cihaz çakışma kontrolü exclusion constraint ile)
CREATE TABLE IF NOT EXISTS randevu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  terapist_id uuid NOT NULL REFERENCES terapist(id) ON DELETE RESTRICT,
  oda_id uuid NOT NULL REFERENCES oda(id) ON DELETE RESTRICT,
  cihaz_id uuid REFERENCES cihaz(id) ON DELETE RESTRICT,
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  durum randevu_durum_tipi NOT NULL DEFAULT 'planlandi',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bitis > baslangic)
);
ALTER TABLE randevu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_randevu_klinik_id ON randevu(klinik_id);
CREATE INDEX IF NOT EXISTS idx_randevu_musteri_id ON randevu(musteri_id);
CREATE INDEX IF NOT EXISTS idx_randevu_baslangic ON randevu(baslangic);

ALTER TABLE randevu ADD COLUMN IF NOT EXISTS zaman_araligi tstzrange
  GENERATED ALWAYS AS (tstzrange(baslangic, bitis, '[)')) STORED;

-- iptal/gelmedi durumundaki randevular çakışma kontrolüne dahil edilmez
ALTER TABLE randevu DROP CONSTRAINT IF EXISTS randevu_oda_cakisma;
ALTER TABLE randevu ADD CONSTRAINT randevu_oda_cakisma
  EXCLUDE USING gist (oda_id WITH =, zaman_araligi WITH &&)
  WHERE (durum NOT IN ('iptal', 'gelmedi'));

ALTER TABLE randevu DROP CONSTRAINT IF EXISTS randevu_terapist_cakisma;
ALTER TABLE randevu ADD CONSTRAINT randevu_terapist_cakisma
  EXCLUDE USING gist (terapist_id WITH =, zaman_araligi WITH &&)
  WHERE (durum NOT IN ('iptal', 'gelmedi'));

ALTER TABLE randevu DROP CONSTRAINT IF EXISTS randevu_cihaz_cakisma;
ALTER TABLE randevu ADD CONSTRAINT randevu_cihaz_cakisma
  EXCLUDE USING gist (cihaz_id WITH =, zaman_araligi WITH &&)
  WHERE (durum NOT IN ('iptal', 'gelmedi') AND cihaz_id IS NOT NULL);

-- 12) klinik_ayarlar (klinik başına tek satır JSONB konfigürasyon)
CREATE TABLE IF NOT EXISTS klinik_ayarlar (
  klinik_id uuid PRIMARY KEY REFERENCES klinik(id) ON DELETE CASCADE,
  ayarlar jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_ayarlar ENABLE ROW LEVEL SECURITY;

-- 13) audit_log (append-only; API üzerinden UPDATE/DELETE policy'si yok)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid REFERENCES klinik(id) ON DELETE SET NULL,
  kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  eylem text NOT NULL,
  hedef_tablo text,
  hedef_id uuid,
  detay jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_log_klinik_id ON audit_log(klinik_id);

-- 14) updated_at trigger'ları
DO $$
DECLARE
  tablo text;
BEGIN
  FOREACH tablo IN ARRAY ARRAY['klinik', 'kullanici', 'personel', 'terapist', 'musteri', 'oda', 'cihaz', 'randevu', 'klinik_ayarlar']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', tablo, tablo);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tablo, tablo
    );
  END LOOP;
END $$;

-- 15) RLS policy'leri

-- klinik: kendi klinik satırını görür; güncelleme klinik_admin/super_admin, oluşturma/silme sadece super_admin
DROP POLICY IF EXISTS "klinik_select_kendi" ON klinik;
CREATE POLICY "klinik_select_kendi" ON klinik
  FOR SELECT USING (id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "klinik_update_yetkili" ON klinik;
CREATE POLICY "klinik_update_yetkili" ON klinik
  FOR UPDATE USING ((id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "klinik_insert_super_admin" ON klinik;
CREATE POLICY "klinik_insert_super_admin" ON klinik
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "klinik_delete_super_admin" ON klinik;
CREATE POLICY "klinik_delete_super_admin" ON klinik
  FOR DELETE USING (is_super_admin());

-- kullanici: kendi kaydı + aynı klinikteki kullanıcıları görür
DROP POLICY IF EXISTS "kullanici_select_kendi_klinik" ON kullanici;
CREATE POLICY "kullanici_select_kendi_klinik" ON kullanici
  FOR SELECT USING (id = auth.uid() OR klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "kullanici_update_kendi_veya_admin" ON kullanici;
CREATE POLICY "kullanici_update_kendi_veya_admin" ON kullanici
  FOR UPDATE USING (
    id = auth.uid()
    OR (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR is_super_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "kullanici_insert_admin" ON kullanici;
CREATE POLICY "kullanici_insert_admin" ON kullanici
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "kullanici_delete_admin" ON kullanici;
CREATE POLICY "kullanici_delete_admin" ON kullanici
  FOR DELETE USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

-- personel / terapist: görüntüleme tüm klinik üyeleri, yönetim sadece klinik_admin (maaş verisi)
DROP POLICY IF EXISTS "personel_select_klinik" ON personel;
CREATE POLICY "personel_select_klinik" ON personel
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "personel_yonet_admin" ON personel;
CREATE POLICY "personel_yonet_admin" ON personel
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "terapist_select_klinik" ON terapist;
CREATE POLICY "terapist_select_klinik" ON terapist
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "terapist_yonet_admin" ON terapist;
CREATE POLICY "terapist_yonet_admin" ON terapist
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- musteri / oda / cihaz: görüntüleme tüm klinik üyeleri, yönetim klinik_admin/resepsiyon
DROP POLICY IF EXISTS "musteri_select_klinik" ON musteri;
CREATE POLICY "musteri_select_klinik" ON musteri
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_yonet_resepsiyon_admin" ON musteri;
CREATE POLICY "musteri_yonet_resepsiyon_admin" ON musteri
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "oda_select_klinik" ON oda;
CREATE POLICY "oda_select_klinik" ON oda
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "oda_yonet_resepsiyon_admin" ON oda;
CREATE POLICY "oda_yonet_resepsiyon_admin" ON oda
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "cihaz_select_klinik" ON cihaz;
CREATE POLICY "cihaz_select_klinik" ON cihaz
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "cihaz_yonet_resepsiyon_admin" ON cihaz;
CREATE POLICY "cihaz_yonet_resepsiyon_admin" ON cihaz
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- randevu: görüntüleme tüm klinik üyeleri; oluşturma klinik_admin/resepsiyon/terapist;
-- güncelleme klinik_admin/resepsiyon veya randevunun kendi terapisti; silme klinik_admin/resepsiyon
DROP POLICY IF EXISTS "randevu_select_klinik" ON randevu;
CREATE POLICY "randevu_select_klinik" ON randevu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_insert_yetkili" ON randevu;
CREATE POLICY "randevu_insert_yetkili" ON randevu
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "randevu_update_resepsiyon_admin" ON randevu;
CREATE POLICY "randevu_update_resepsiyon_admin" ON randevu
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_update_terapist_kendi" ON randevu;
CREATE POLICY "randevu_update_terapist_kendi" ON randevu
  FOR UPDATE USING (
    klinik_id = current_klinik_id()
    AND terapist_id IN (
      SELECT t.id FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE p.kullanici_id = auth.uid()
    )
  )
  WITH CHECK (klinik_id = current_klinik_id());

DROP POLICY IF EXISTS "randevu_delete_yetkili" ON randevu;
CREATE POLICY "randevu_delete_yetkili" ON randevu
  FOR DELETE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- klinik_ayarlar: görüntüleme tüm klinik üyeleri, yönetim klinik_admin
DROP POLICY IF EXISTS "klinik_ayarlar_select_klinik" ON klinik_ayarlar;
CREATE POLICY "klinik_ayarlar_select_klinik" ON klinik_ayarlar
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "klinik_ayarlar_yonet_admin" ON klinik_ayarlar;
CREATE POLICY "klinik_ayarlar_yonet_admin" ON klinik_ayarlar
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- audit_log: klinik üyeleri kendi klinikleri adına satır ekleyebilir; okuma klinik_admin/super_admin;
-- UPDATE/DELETE policy'si tanımlanmadı (immutable log, sadece service role dokunabilir)
DROP POLICY IF EXISTS "audit_log_insert_klinik" ON audit_log;
CREATE POLICY "audit_log_insert_klinik" ON audit_log
  FOR INSERT WITH CHECK (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "audit_log_select_admin" ON audit_log;
CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

-- Kontrol:
-- SELECT table_name, row_security FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT proname FROM pg_proc WHERE proname IN ('current_klinik_id', 'current_rol', 'is_super_admin');
