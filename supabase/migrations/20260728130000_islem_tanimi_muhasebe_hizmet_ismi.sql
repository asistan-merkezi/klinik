-- Paraşüt hizmet kodu yanına: muhasebe tarafında görünecek okunur hizmet ismi
-- (opsiyonel, Paraşüt kodundan farklı olabilir — ör. "Manuel Terapi Seansı").
ALTER TABLE islem_tanimi ADD COLUMN IF NOT EXISTS muhasebe_hizmet_ismi text;
