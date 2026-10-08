-- Şirket Bilgileri > Kredi Kartları: klinik başına birden çok kart kaydı,
-- "şirket kartı" / "şahıs kartı" ayrımıyla (klinik_banka_hesaplari.hesap_tipi ile aynı ayrım).
--
-- BİLİNÇLİ OLARAK TAM KART NUMARASI, SON KULLANMA TARİHİ VE CVV TUTULMAZ:
-- PCI DSS tam PAN/CVV'nin (özellikle CVV'nin) saklanmasını yasaklar; projede
-- pgcrypto/uygulama katmanı şifrelemesi de yok. Yalnız tanımlayıcı bilgi:
-- takma ad, banka, kart sahibi ve son 4 hane. Gerçek tahsilat/ödeme için
-- ileride sağlayıcı (İyzico/Stripe) tokenizasyonu kullanılmalı.
-- klinik_banka_hesaplari ile aynı RLS: klinik_admin + muhasebe, + super_admin. İdempotent.

CREATE TABLE IF NOT EXISTS klinik_kredi_kartlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kart_tipi text NOT NULL DEFAULT 'klinik' CHECK (kart_tipi IN ('klinik', 'sahis')),
  kart_adi text NOT NULL,
  banka_adi text NOT NULL,
  kart_sahibi text NOT NULL DEFAULT '',
  son_dort_hane text CHECK (son_dort_hane IS NULL OR son_dort_hane ~ '^\d{4}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_kredi_kartlari ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_klinik_kredi_kartlari_klinik_id ON klinik_kredi_kartlari(klinik_id);

DROP TRIGGER IF EXISTS trg_klinik_kredi_kartlari_updated_at ON klinik_kredi_kartlari;
CREATE TRIGGER trg_klinik_kredi_kartlari_updated_at
  BEFORE UPDATE ON klinik_kredi_kartlari
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP POLICY IF EXISTS "klinik_kredi_kartlari_select" ON klinik_kredi_kartlari;
CREATE POLICY "klinik_kredi_kartlari_select" ON klinik_kredi_kartlari
  FOR SELECT USING (
    (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'muhasebe'))
    OR (SELECT is_super_admin())
  );

DROP POLICY IF EXISTS "klinik_kredi_kartlari_yonet" ON klinik_kredi_kartlari;
CREATE POLICY "klinik_kredi_kartlari_yonet" ON klinik_kredi_kartlari
  FOR ALL USING (
    (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'muhasebe'))
    OR (SELECT is_super_admin())
  )
  WITH CHECK (
    (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'muhasebe'))
    OR (SELECT is_super_admin())
  );

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'klinik_kredi_kartlari';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'klinik_kredi_kartlari';
