-- "Seansı Tamamla" — Hasta Detay > Tedavi & Anamnez > Seans Geçmişi'nden
-- terapist/klinik_admin/resepsiyon'un elle tetiklediği bir tamamlama adımı
-- (kullanıcı kararı: daha önce kaldırılan, süre geçince kendiliğinden
-- oluşan otomatik "Tamamlandı" durumunun TAM TERSİ bir yaklaşım — bu kez
-- açıklama + tamamlayan bilgisiyle bilinçli/elle işaretlenir).
ALTER TYPE randevu_durum_tipi ADD VALUE IF NOT EXISTS 'tamamlandi';

ALTER TABLE randevu ADD COLUMN IF NOT EXISTS tamamlanma_aciklamasi text;
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS tamamlayan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS tamamlanma_tarihi timestamptz;

-- RLS: mevcut randevu_update_terapist_kendi / randevu_update_resepsiyon_admin
-- policy'leri satır bazlı (kolon kısıtı yok), bu 3 nullable kolon var olan
-- UPDATE yetkisiyle otomatik kapsanıyor — yeni bir policy gerekmiyor.

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'randevu'
--   AND column_name IN ('tamamlanma_aciklamasi', 'tamamlayan_kullanici_id', 'tamamlanma_tarihi');
-- SELECT enum_range(NULL::randevu_durum_tipi);
