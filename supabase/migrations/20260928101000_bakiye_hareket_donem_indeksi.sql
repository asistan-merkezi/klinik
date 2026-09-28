-- hasta_bakiye_hareket'i klinik + tür + tarih aralığıyla okuyan ekranlar
-- (Kesilen Faturalar'ın Yıllık/Aylık/Günlük görünümü: tur='borc' +
-- created_at aralığı + created_at DESC sıralama; Kasa/Banka ve Raporlar'ın
-- tur='odeme' dönem sorguları) şimdiye kadar yalnız tekil klinik_id
-- index'ini kullanabiliyordu — kliniğin tüm defterini tarayıp sonra süzüyordu.
-- Bileşik index bu sorguları doğrudan dönem aralığına indirir.
-- Salt ek index, veri/davranış değişmez. İdempotent.

CREATE INDEX IF NOT EXISTS idx_hasta_bakiye_hareket_klinik_tur_created
  ON hasta_bakiye_hareket (klinik_id, tur, created_at DESC);

-- Kontrol:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'hasta_bakiye_hareket';
