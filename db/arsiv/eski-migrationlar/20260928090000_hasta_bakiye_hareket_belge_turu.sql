-- Odeme Ekle formuna "Belgelendirme Cinsi" (Fatura/Fis/Serbest) eklendi --
-- hastaya odeme aninda hangi belgenin verildigini, odeme_yontemi'nde oldugu
-- gibi (bkz. 20260916091000_hasta_bakiye_hareket_odeme_yontemi.sql) ayri,
-- yapilandirilmis bir kolonda tutuyoruz. Nullable: yalniz tur='odeme'
-- satirlarinda dolar. Idempotent, tek blok.

ALTER TABLE hasta_bakiye_hareket
  ADD COLUMN IF NOT EXISTS belge_turu text CHECK (belge_turu IN ('fatura', 'fis', 'serbest'));

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hasta_bakiye_hareket' AND column_name = 'belge_turu';
