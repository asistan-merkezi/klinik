-- Personel sidebar "Personel" (bordro listesi) / "Personel Takip" (alacak takibi) olarak
-- 2 sayfaya ayrılıyor (kullanıcı kararı, Tedaviler/Tedavi Protokolleri ile aynı hub deseni):
-- 1) Personel: personel_ekstra_hakedis'e 'sgk' türü eklenir (yol/yemek/mesai ile aynı desen),
--    personel gruplarına (görev) göre maaş + fazla mesai + yol/yemek + SGK bordro maliyeti gösterilecek.
-- 2) Personel Takip: personelin klinikten "alacağı" (hesaplanan hakediş - fiilen ödenen) takip
--    edilir. Hakediş tarafı için ayrı bir ledger AÇILMADI (maaş/prim/ekstra-hakediş zaten tek
--    kaynak, her sorguda hesaplanıyor) — sadece "fiilen ödendi" tarafını tutan yeni personel_odeme
--    tablosu eklendi, personel_ekstra_hakedis ile aynı RLS deseni (görüntüleme admin+kendisi,
--    yönetim sadece klinik_admin) kullanıldı.

-- 1) personel_ekstra_hakedis.tur'a 'sgk' eklenir (constraint adı sabit varsayılmadan, dinamik bulunup düşürülür)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'personel_ekstra_hakedis'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tur%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE personel_ekstra_hakedis DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE personel_ekstra_hakedis ADD CONSTRAINT personel_ekstra_hakedis_tur_check
  CHECK (tur IN ('yol', 'yemek', 'mesai', 'sgk', 'diger'));

-- 2) personel_odeme: personele fiilen yapılan ödeme kayıtları (alacak takibinde "ödenen" tarafı)
CREATE TABLE IF NOT EXISTS personel_odeme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  tutar numeric(10, 2) NOT NULL CHECK (tutar > 0),
  tarih date NOT NULL DEFAULT current_date,
  aciklama text,
  odeyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE personel_odeme ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_odeme_klinik_id ON personel_odeme(klinik_id);
CREATE INDEX IF NOT EXISTS idx_personel_odeme_personel_id ON personel_odeme(personel_id);
CREATE INDEX IF NOT EXISTS idx_personel_odeme_tarih ON personel_odeme(tarih);

DROP POLICY IF EXISTS "personel_odeme_select" ON personel_odeme;
CREATE POLICY "personel_odeme_select" ON personel_odeme
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR EXISTS (
      SELECT 1 FROM personel p WHERE p.id = personel_odeme.personel_id AND p.kullanici_id = auth.uid()
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_odeme_yonet_admin" ON personel_odeme;
CREATE POLICY "personel_odeme_yonet_admin" ON personel_odeme
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'personel_ekstra_hakedis'::regclass AND contype='c';
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'personel_odeme';
