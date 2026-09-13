-- Finans hub'ının Banka bölümü için iskelet: klinik başına birden çok banka
-- hesabı listesi (IBAN dahil). Şu an için UI sadece placeholder ("yakında"),
-- bu migration ileride o ekranın CRUD'unu bağlayabileceği tabloyu önceden
-- kurar. klinik_arac ile aynı basit klinik-scoped desen (klinik_id doğrudan
-- tutulur, derive_klinik_id_from_parent gerekmiyor). klinik_arac'tan farkı:
-- IBAN/hesap sahibi hassas finansal veri olduğu için SELECT de klinik_arac'taki
-- gibi "klinikteki herkese açık" değil, klinik_admin+muhasebe'ye kısıtlı.
-- İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS klinik_banka_hesaplari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  banka_adi text NOT NULL,
  sube text,
  hesap_sahibi text NOT NULL,
  iban text NOT NULL,
  hesap_tipi text NOT NULL DEFAULT 'klinik' CHECK (hesap_tipi IN ('klinik', 'sahis')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_banka_hesaplari ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_klinik_banka_hesaplari_klinik_id ON klinik_banka_hesaplari(klinik_id);

DROP TRIGGER IF EXISTS trg_klinik_banka_hesaplari_updated_at ON klinik_banka_hesaplari;
CREATE TRIGGER trg_klinik_banka_hesaplari_updated_at
  BEFORE UPDATE ON klinik_banka_hesaplari
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: görüntüleme + yönetim yalnız klinik_admin+muhasebe (Finans hub'ının
-- diğer ekranlarıyla aynı rol seti), + super_admin bypass.
DROP POLICY IF EXISTS "klinik_banka_hesaplari_select" ON klinik_banka_hesaplari;
CREATE POLICY "klinik_banka_hesaplari_select" ON klinik_banka_hesaplari
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "klinik_banka_hesaplari_yonet" ON klinik_banka_hesaplari;
CREATE POLICY "klinik_banka_hesaplari_yonet" ON klinik_banka_hesaplari
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'klinik_banka_hesaplari';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'klinik_banka_hesaplari';
