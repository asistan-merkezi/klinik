-- Randevu sonuç durumları genişletildi (kullanıcı kararı): "Geldi" tekliğinin
-- yanına "Gecikmeli Geldi" (gecikme dakikası ayrıca tutulur, check-in bakiye/
-- paket mantığı Geldi ile birebir aynı) ve "Ertelendi" (girilen yeni tarih/
-- saat DOĞRUDAN randevunun baslangic/bitis'ine işlenir — ayrı bir randevu
-- oluşturulmaz, aynı satır yeni zamana taşınır) eklendi.
--
-- ALTER TYPE ... ADD VALUE, eklenen değerin aynı transaction içinde
-- kullanılmasına izin vermiyor — bu yüzden bu değerleri kullanan mantık
-- (RPC güncellemesi) ayrı bir sonraki migration'da (20260731130000).

ALTER TYPE randevu_durum_tipi ADD VALUE IF NOT EXISTS 'gecikmeli_geldi';
ALTER TYPE randevu_durum_tipi ADD VALUE IF NOT EXISTS 'ertelendi';

ALTER TABLE randevu ADD COLUMN IF NOT EXISTS gecikme_dakika integer CHECK (gecikme_dakika IS NULL OR gecikme_dakika > 0);
