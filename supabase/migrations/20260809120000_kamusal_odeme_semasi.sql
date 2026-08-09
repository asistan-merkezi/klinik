-- Muhasebe > Kamusal Giderler yeniden tasarlandı (kullanıcının paylaştığı
-- referans ekranlara göre): tek serbest-metin açıklama + tek tarih yerine
-- sabit "Ödeme Tipi" listesi, Dönem (Ay/Yıl), Vade Tarihi / Ödeme Tarihi
-- ayrımı (Ödeme Tarihi NULL = henüz ödenmedi, durum vade_tarihi'ne göre
-- bekliyor/gecikti olarak app tarafında türetilir) ve düzenleme/silme.
-- Önceki turda bu amaçla klinik_harcama (kategori='vergi_sgk') kullanılmıştı
-- ama tek tarih alanı vade/ödendi ayrımını desteklemiyordu; canlıda o
-- kategoriyle hiç kayıt girilmemişti (0 satır, service-role ile doğrulandı),
-- bu yüzden veri taşıma adımına gerek kalmadan ayrı, amaca özel bir tabloya
-- geçiliyor. İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS kamusal_odeme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  odeme_tipi text NOT NULL CHECK (odeme_tipi IN (
    'kdv', 'stopaj_muhtasar', 'sgk_primleri', 'damga_vergisi', 'emlak_vergisi',
    'motorlu_tasitlar_vergisi', 'bagkur_primleri', 'muhasebe_ucreti',
    'trafik_cezasi', 'gec_odeme_faizi', 'gecici_vergi', 'kurumlar_vergisi'
  )),
  tutar numeric(12, 2) NOT NULL CHECK (tutar >= 0),
  donem_ay smallint NOT NULL CHECK (donem_ay BETWEEN 1 AND 12),
  donem_yil smallint NOT NULL CHECK (donem_yil BETWEEN 2000 AND 2100),
  vade_tarihi date NOT NULL,
  odeme_tarihi date,
  notlar text,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kamusal_odeme ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kamusal_odeme_klinik_id ON kamusal_odeme(klinik_id);
CREATE INDEX IF NOT EXISTS idx_kamusal_odeme_donem ON kamusal_odeme(klinik_id, donem_yil, donem_ay);

DROP TRIGGER IF EXISTS trg_kamusal_odeme_updated_at ON kamusal_odeme;
CREATE TRIGGER trg_kamusal_odeme_updated_at BEFORE UPDATE ON kamusal_odeme
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: klinik_harcama ile aynı desen — görüntüleme klinik_admin + muhasebe;
-- yönetim (ekleme/düzenleme/silme) sadece klinik_admin.
DROP POLICY IF EXISTS "kamusal_odeme_select" ON kamusal_odeme;
CREATE POLICY "kamusal_odeme_select" ON kamusal_odeme
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "kamusal_odeme_yonet_admin" ON kamusal_odeme;
CREATE POLICY "kamusal_odeme_yonet_admin" ON kamusal_odeme
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- klinik_harcama.kategori='vergi_sgk' artık kullanılmıyor (yukarısı) —
-- CHECK'ten kaldırılıyor, diğer kategoriler (kira/fatura/malzeme/diger) aynen kalıyor.
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
  CHECK (kategori IN ('kira', 'fatura', 'malzeme', 'diger'));

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'kamusal_odeme';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'kamusal_odeme';
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'klinik_harcama'::regclass AND contype='c';
