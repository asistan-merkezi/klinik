-- Vücut haritası artık serbest x/y koordinat yerine sabit anatomik bölge
-- path'leri (lib/vucut-bolgeleri.ts) kullanıyor; ön/arka görünüm ayrımı
-- gerekiyor (yuz), x/y ise path-bazlı işaretlerde yazılmadığı için nullable
-- olmalı (eski kayıtlar için geriye dönük uyumluluk amacıyla kolonlar
-- silinmiyor, sadece zorunluluğu kaldırılıyor).
ALTER TABLE musteri_vucut_haritasi_isareti
  ADD COLUMN IF NOT EXISTS yuz text NOT NULL DEFAULT 'on';

ALTER TABLE musteri_vucut_haritasi_isareti
  DROP CONSTRAINT IF EXISTS musteri_vucut_haritasi_isareti_yuz_check;
ALTER TABLE musteri_vucut_haritasi_isareti
  ADD CONSTRAINT musteri_vucut_haritasi_isareti_yuz_check CHECK (yuz IN ('on', 'arka'));

ALTER TABLE musteri_vucut_haritasi_isareti
  ALTER COLUMN yuz DROP DEFAULT;

ALTER TABLE musteri_vucut_haritasi_isareti
  ALTER COLUMN x DROP NOT NULL;
ALTER TABLE musteri_vucut_haritasi_isareti
  ALTER COLUMN y DROP NOT NULL;

-- Kontrol:
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns
--   WHERE table_name = 'musteri_vucut_haritasi_isareti' AND column_name IN ('yuz','x','y');
