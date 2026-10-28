-- Periyodik randevu artık sabit bir bitiş tarihi taşıyor (oluşturma/yenileme
-- anında bugünden +5 ay olarak hesaplanır, uygulama katmanında). Mevcut
-- (bu turdan önceki) satırlar geriye dönük etkilenmesin diye nullable —
-- yeni/yenilenen satırlarda uygulama her zaman değer atar.
ALTER TABLE periyodik_randevu ADD COLUMN IF NOT EXISTS bitis_tarihi date;

-- Süre bitimine 2 hafta kala ekranda uyarı gösterilir; kullanıcı "yenilenmeyecek"
-- derse bu false olur ve uyarı bir daha gösterilmez (seri kendi bitiş
-- tarihinde zaten yeni randevu üretmeyi durdurur).
ALTER TABLE periyodik_randevu ADD COLUMN IF NOT EXISTS otomatik_yenile boolean NOT NULL DEFAULT true;
