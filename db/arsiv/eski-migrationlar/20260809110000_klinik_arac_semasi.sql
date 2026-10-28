-- Şirket Bilgileri > Araçlar bölümü: klinik envanterindeki araçların
-- marka/model/plaka listesi. klinik_harcama ile aynı basit klinik-scoped
-- desen (klinik_id doğrudan tutulur, derive_klinik_id_from_parent gerekmiyor
-- çünkü klinik_admin formdan doğrudan kendi klinik_id'siyle insert ediyor).
-- İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS klinik_arac (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  marka text NOT NULL,
  model text NOT NULL,
  plaka text NOT NULL,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_arac ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_klinik_arac_klinik_id ON klinik_arac(klinik_id);

-- RLS: görüntüleme klinikteki herkese açık (hassas/finansal veri değil,
-- sirket_bilgileri sayfasının geri kalanının aksine bilgi amaçlı); ekleme/silme
-- sadece klinik_admin (klinik_harcama_yonet_admin ile aynı desen).
DROP POLICY IF EXISTS "klinik_arac_select" ON klinik_arac;
CREATE POLICY "klinik_arac_select" ON klinik_arac
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "klinik_arac_yonet_admin" ON klinik_arac;
CREATE POLICY "klinik_arac_yonet_admin" ON klinik_arac
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'klinik_arac';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'klinik_arac';
