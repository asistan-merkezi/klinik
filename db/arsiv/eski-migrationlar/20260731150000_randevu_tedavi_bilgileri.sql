-- Randevu bazlı "Tedavi Bilgileri" kartı için 3 opsiyonel alan: Tanı
-- (serbest metin), Antrenör (personel'den — terapistten bağımsız, ayrı bir
-- kullanici_rol_tipi DEĞİL, personel.gorev zaten serbest metin olduğu için
-- 'Antrenör' iş unvanı yeni bir enum'a gerek kalmadan zaten girilebiliyor)
-- ve Tedavi Protokolü (yeni tedavi_protokolu kataloğundan seçim — bir önceki
-- turda eklenen musteri_protokol/hasta_protokol'den FARKLI: o hasta bazlı tek
-- bir tedavi kursu atamasıyken, burada her randevu kendi protokol/tanı/
-- antrenör bilgisini bağımsız tutar, "Tedavi Türü" (islem_tanimi_id) zaten
-- aynı desende randevu'ya bağlıydı.
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS tani text;
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS antrenor_id uuid REFERENCES personel(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS tedavi_protokolu_id uuid REFERENCES tedavi_protokolu(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_randevu_antrenor_id ON randevu(antrenor_id);
CREATE INDEX IF NOT EXISTS idx_randevu_tedavi_protokolu_id ON randevu(tedavi_protokolu_id);

-- RLS: yeni bir policy gerekmiyor — mevcut randevu_update_terapist_kendi ve
-- randevu_update_resepsiyon_admin policy'leri satır bazlı (kolon kısıtı yok),
-- bu 3 nullable kolon var olan UPDATE yetkisiyle otomatik kapsanıyor.

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'randevu'
--   AND column_name IN ('tani', 'antrenor_id', 'tedavi_protokolu_id');
