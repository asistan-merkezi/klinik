-- Randevunun hangi tedavi için olduğu (Günün Çizelgesi'nde tedavi rengiyle
-- gösterim + ileride raporlama için). Nullable: mevcut randevular geriye
-- dönük etkilenmesin; "zorunluluk" yalnızca uygulama katmanında (randevu
-- oluşturma formu) uygulanır, DB seviyesinde NOT NULL yapmıyoruz.
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS islem_tanimi_id uuid REFERENCES islem_tanimi(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_randevu_islem_tanimi_id ON randevu(islem_tanimi_id);
