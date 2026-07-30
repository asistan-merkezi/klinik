-- Adres seçici altyapısı (turkey-neighbourhoods paketi + AdresSecici bileşeni,
-- bkz. önceki tur) hasta_hassas'a bağlanıyor: il/ilçe/mahalle artık dropdown ile
-- ayrı ayrı tutuluyor, mevcut `adres` kolonu sokak/cadde/no/daire gibi açık adres
-- detayı için serbest metin olarak kalıyor.
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS il text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS ilce text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS mahalle text;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_hassas'
--   AND column_name IN ('il', 'ilce', 'mahalle');
