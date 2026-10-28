-- Kasa/Banka özelliği: hasta ödemelerinin (tur='odeme') kasa mutabakatına
-- dahil edilebilmesi için hasta_bakiye_hareket'e yapılandırılmış ödeme
-- yöntemi + banka hesabı eklenir. Bugüne kadar ödeme yöntemi ayrı bir kolon
-- değildi, "Ödeme Ekle" formu bunu aciklama metnine gömüyordu ("Nakit — ...")
-- — bu metin-etiket YOK EDİLMİYOR (geriye dönük görünürlük için kalıyor),
-- yeni kolonlar bunun yanına ekleniyor ve Kasa/Banka bunlardan okuyacak.
-- Nullable: sadece tur='odeme' satırlarında dolar, iade/kredi/borc'ta NULL
-- kalır (bu türler için ayrı bir ödeme-yöntemi kavramı bu turda kapsam dışı).
-- İdempotent, tek blok.

ALTER TABLE hasta_bakiye_hareket
  ADD COLUMN IF NOT EXISTS odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'kredi_karti', 'banka_havalesi')),
  ADD COLUMN IF NOT EXISTS banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'hasta_bakiye_hareket' ORDER BY ordinal_position;
