-- Kan sulandırıcı kullanımı: alerjiler gibi ayrı, vurgulu bir klinik güvenlik
-- alanı olarak çıkarılır (kuru iğneleme/manuel terapi gibi riskli işlemler
-- öncesi kritik). Önceden "Sürekli Kullanılan İlaçlar" serbest metnine
-- gömülüydü. Diğer sağlık verisi alanlarıyla aynı rıza kapsamında.
ALTER TABLE musteri_hassas
  ADD COLUMN IF NOT EXISTS kan_sulandirici_kullanimi boolean NOT NULL DEFAULT false;
