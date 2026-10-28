-- Destek > Talep ve Şikayetler: panel kullanıcılarının yazılım/panel hakkındaki
-- talep veya şikayetlerini kaydettiği basit bir tablo (klinik_arac ile aynı desen
-- — klinik_id doğrudan tutulur, derive_klinik_id_from_parent gerekmiyor).

CREATE TABLE IF NOT EXISTS destek_talebi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kullanici_id uuid NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  tur text NOT NULL CHECK (tur IN ('talep', 'sikayet')),
  konu text NOT NULL,
  aciklama text NOT NULL,
  durum text NOT NULL DEFAULT 'yeni' CHECK (durum IN ('yeni', 'inceleniyor', 'cozuldu')),
  created_at timestamptz NOT NULL DEFAULT now(),
  guncellenme_tarihi timestamptz
);
ALTER TABLE destek_talebi ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_destek_talebi_klinik_id ON destek_talebi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_destek_talebi_kullanici_id ON destek_talebi(kullanici_id);

-- SELECT: kendi gönderdiği talep/şikayet + klinik_admin kendi kliniğinin tamamını görür
-- (personel_ekstra_hakedis_select ile aynı "görüntüleme admin+kendisi" deseni) + super_admin.
DROP POLICY IF EXISTS "destek_talebi_select" ON destek_talebi;
CREATE POLICY "destek_talebi_select" ON destek_talebi
  FOR SELECT USING (
    kullanici_id = auth.uid()
    OR (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR is_super_admin()
  );

-- INSERT: herhangi bir panel kullanıcısı (rol farketmez) sadece kendi adına, kendi kliniğine yazabilir.
DROP POLICY IF EXISTS "destek_talebi_insert" ON destek_talebi;
CREATE POLICY "destek_talebi_insert" ON destek_talebi
  FOR INSERT WITH CHECK (
    kullanici_id = auth.uid()
    AND klinik_id = current_klinik_id()
  );

-- UPDATE (durum): sadece klinik_admin (kendi klinik) veya super_admin.
DROP POLICY IF EXISTS "destek_talebi_update" ON destek_talebi;
CREATE POLICY "destek_talebi_update" ON destek_talebi
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

-- Doğrulama (elle):
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'destek_talebi';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'destek_talebi';
