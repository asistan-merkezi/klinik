-- Tedavi tanımlarına opsiyonel uygulama süresi (dakika) eklenir. Randevu
-- oluşturma formlarında tedavi seçilince Süre alanı bu değerle otomatik
-- doldurulur (client-side, bkz. randevu-formu.tsx/periyodik-randevu-formu.tsx)
-- — NULL kalırsa mevcut sabit varsayılan (30dk) korunur, geriye dönük
-- kayıtlar etkilenmez. İdempotent, tek blok.

ALTER TABLE islem_tanimi
  ADD COLUMN IF NOT EXISTS sure_dakika integer CHECK (sure_dakika IS NULL OR sure_dakika > 0);

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'islem_tanimi' ORDER BY ordinal_position;
