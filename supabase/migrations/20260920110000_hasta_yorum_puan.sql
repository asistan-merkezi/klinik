-- Hasta Detayı > Talep ve Öneriler'deki Terapist Yorumu/Randevu Hakkında
-- Yorum'a memnuniyet puanı (1-5, emoji etiketli: Çok Yetersiz..Çok İyi)
-- eklendi — seans_degerlendirme'deki puan+oneri_metni ile aynı fikir.

ALTER TABLE hasta_yorum ADD COLUMN IF NOT EXISTS puan smallint CHECK (puan BETWEEN 1 AND 5);

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hasta_yorum' AND column_name = 'puan';
