-- Personel Detay > Ödemeler'deki "Ekstra Hakedişler" kartı UI'da "Ödemeler" olarak
-- yeniden adlandırıldı (kullanıcı kararı). Aynı turda ödeme türleri değişti:
-- 'sgk' kaldırıldı (SGK işveren maliyeti zaten Muhasebe > klinik_harcama
-- kategori='vergi_sgk' üzerinden takip ediliyordu, bkz. lib/raporlar/hesaplamalar.ts
-- hesaplaMuhasebeGideri — personel_ekstra_hakedis'teki 'sgk' türü kısa süre önce
-- (20260805090000) eklenmişti ama raporlar tarafında hiç filtrelenmiyordu, bu yüzden
-- aslında Sabit Personel Maliyeti'ne yanlışlıkla karışıyordu; kaldırılması bu
-- tutarsızlığı da çözüyor), yerine 'avans' eklendi. Canlıda 'sgk' türünde kayıt
-- olmadığı doğrulandı (PostgREST ile kontrol edildi), veri dönüşümüne gerek yok.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'personel_ekstra_hakedis'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tur%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE personel_ekstra_hakedis DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE personel_ekstra_hakedis ADD CONSTRAINT personel_ekstra_hakedis_tur_check
  CHECK (tur IN ('yol', 'yemek', 'mesai', 'avans', 'diger'));

-- Kontrol:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'personel_ekstra_hakedis'::regclass AND contype='c';
