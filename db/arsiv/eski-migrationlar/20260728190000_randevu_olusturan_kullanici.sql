-- Randevuyu kim oluşturdu bilgisi (Yaklaşan Randevular listesinde "randevu
-- oluşturan kişi" olarak gösterilecek). created_at zaten vardı (oluşturma
-- tarih/saati); randevu tarih/saati zaten baslangic/bitis'te tutuluyor.
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS olusturan_kullanici_id uuid
  REFERENCES kullanici(id) ON DELETE SET NULL;
