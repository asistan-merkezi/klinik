-- Periyodik randevu: haftanın belirli günü + saatinde tekrar eden randevu
-- tanımı. Gerçek "sonsuza kadar otomatik üret" için pg_cron/Edge Function
-- gerekir; bu proje henüz böyle bir zamanlanmış iş altyapısını kurmadı/
-- doğrulamadı (Paraşüt'teki gibi doğrulanamayan entegrasyon riski). Bunun
-- yerine oluşturma anında ileriye dönük geniş bir pencere (uygulama
-- katmanında 52 hafta) somut randevu satırı üretiliyor; seri iptal
-- edilince henüz gelmemiş satırlar toplu iptal ediliyor. Gerçek sonsuzluk
-- değil ama klinik planlama ufku için pratikte yeterli.
CREATE TABLE IF NOT EXISTS periyodik_randevu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  terapist_id uuid NOT NULL REFERENCES terapist(id) ON DELETE RESTRICT,
  oda_id uuid NOT NULL REFERENCES oda(id) ON DELETE RESTRICT,
  cihaz_id uuid REFERENCES cihaz(id) ON DELETE RESTRICT,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE RESTRICT,
  haftanin_gunu smallint NOT NULL CHECK (haftanin_gunu BETWEEN 0 AND 6), -- 0=Pazar..6=Cumartesi (JS Date.getDay())
  saat time NOT NULL,
  sure_dakika integer NOT NULL DEFAULT 30 CHECK (sure_dakika >= 5 AND sure_dakika <= 480),
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'iptal')),
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE periyodik_randevu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_periyodik_randevu_klinik_id ON periyodik_randevu(klinik_id);
CREATE INDEX IF NOT EXISTS idx_periyodik_randevu_musteri_id ON periyodik_randevu(musteri_id);

DROP POLICY IF EXISTS "periyodik_randevu_select_klinik" ON periyodik_randevu;
CREATE POLICY "periyodik_randevu_select_klinik" ON periyodik_randevu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "periyodik_randevu_insert_yetkili" ON periyodik_randevu;
CREATE POLICY "periyodik_randevu_insert_yetkili" ON periyodik_randevu
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "periyodik_randevu_update_resepsiyon_admin" ON periyodik_randevu;
CREATE POLICY "periyodik_randevu_update_resepsiyon_admin" ON periyodik_randevu
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (klinik_id = current_klinik_id() OR is_super_admin());

-- Üretilen randevu satırlarını kendi periyodik serisine bağlar; seri iptal
-- edilince henüz gelmemiş (planlandi durumundaki) satırlar bulunup toplu
-- iptal edilebilsin.
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS periyodik_randevu_id uuid
  REFERENCES periyodik_randevu(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_randevu_periyodik_randevu_id ON randevu(periyodik_randevu_id);
