-- Hastalar listesindeki arama (.or(`ad_soyad.ilike.%...%,telefon.ilike.%...%`))
-- hiçbir indeks olmadan sequential scan yapıyordu — CLAUDE.md'de "pg_trgm ile
-- full-text arama olacak" hedefi belgelenmişti ama hiç uygulanmamıştı.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_hasta_ad_soyad_trgm ON hasta USING gin (ad_soyad gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hasta_telefon_trgm ON hasta USING gin (telefon gin_trgm_ops);
