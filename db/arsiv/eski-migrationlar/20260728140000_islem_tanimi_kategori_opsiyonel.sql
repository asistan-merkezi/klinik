-- "Tedavi Tanımları" formunda kategori bölümü kaldırıldı (kullanıcı kararı: kategori
-- oluşturma ekranı hiç yapılmamıştı, NOT NULL zorunluluğu yeni tedavi eklemeyi engelliyordu).
-- islem_kategori tablosu ileride raporlama için durur, sadece zorunluluk kaldırılıyor.
ALTER TABLE islem_tanimi ALTER COLUMN islem_kategori_id DROP NOT NULL;
