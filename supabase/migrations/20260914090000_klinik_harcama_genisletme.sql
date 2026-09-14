-- Finans > Giderler ekranı ("Yakında" placeholder'dan gerçek CRUD'a geçiyor).
-- klinik_harcama'ya yeni alanlar eklenir: tedarikçi (serbest metin — ayrı bir
-- tedarikçi dizini kurulmadı, kullanıcı kararı), ilişkili araç (klinik_arac,
-- bakım/yakıt/sigorta gibi araç giderlerini işaretlemek için opsiyonel),
-- ödeme tipi + banka hesabı (klinik_banka_hesaplari — yalnız havale'de dolu).
-- kategori listesine 'bakim_hizmet' eklenir (cihaz/araç bakımı, temizlik gibi
-- hizmet giderleri için); mevcut kira/fatura/malzeme/diger aynen kalır.
-- İdempotent, tek blok.

ALTER TABLE klinik_harcama
  ADD COLUMN IF NOT EXISTS tedarikci_adi text,
  ADD COLUMN IF NOT EXISTS arac_id uuid REFERENCES klinik_arac(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS odeme_tipi text CHECK (odeme_tipi IN ('nakit', 'havale', 'kredi_karti')),
  ADD COLUMN IF NOT EXISTS banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'klinik_harcama'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kategori%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE klinik_harcama DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_kategori_check
  CHECK (kategori IN ('kira', 'fatura', 'malzeme', 'bakim_hizmet', 'diger'));

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'klinik_harcama' ORDER BY ordinal_position;
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'klinik_harcama'::regclass AND contype='c';
