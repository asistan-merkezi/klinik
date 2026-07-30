-- personel'de hiç adres alanı yoktu (CLAUDE.md'de belirtildiği gibi); hasta_hassas
-- ve klinik'te kullanılan aynı desen burada da uygulanıyor: serbest metin `adres`
-- (sokak/cadde/no/daire) + AdresSecici dropdown'ları için il/ilçe/mahalle.
ALTER TABLE personel ADD COLUMN IF NOT EXISTS adres text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS il text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS ilce text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS mahalle text;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'personel'
--   AND column_name IN ('adres', 'il', 'ilce', 'mahalle');
