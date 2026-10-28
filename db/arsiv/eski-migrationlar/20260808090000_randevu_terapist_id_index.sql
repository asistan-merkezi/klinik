-- randevu.terapist_id hiç indekslenmemişti (sadece terapist_id+zaman_araligi
-- üzerindeki GiST exclusion constraint'in dolaylı indeksi vardı). Personel
-- Detay (gün/hafta/ay seans sayısı, 3 sorgu) ve Personel Takip (terapist
-- başına 1 sorgu, N+1) ekranlarının hepsi
-- .eq("terapist_id", x).in("durum", ...).gte("baslangic", ...).lt(...)
-- desenini kullanıyor — bu sorgu şeklini karşılayan bir btree indeks yoktu,
-- tablo büyüdükçe personel sayfaları gitgide yavaşlıyordu.
CREATE INDEX IF NOT EXISTS idx_randevu_terapist_id_baslangic
  ON randevu(terapist_id, baslangic);
