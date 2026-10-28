-- Adres seçici altyapısını (AdresSecici bileşeni) Şirket Bilgileri formuna
-- bağlamak için: klinik.adres zaten serbest metin olarak var, yanına il/ilçe/
-- mahalle dropdown'ları için ayrı kolonlar ekleniyor (bkz. hasta_hassas'taki
-- aynı desen, migration 20260730120000).
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS il text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS ilce text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS mahalle text;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'klinik'
--   AND column_name IN ('il', 'ilce', 'mahalle');
