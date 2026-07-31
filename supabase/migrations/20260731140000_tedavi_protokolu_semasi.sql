-- Tedavi Protokolleri: klinik geneli, sıralı tedavi adımlarından oluşan
-- şablon/tanım tabloları (islem_tanimi/paket ile aynı "fiyat kataloğu" deseni
-- — sadece klinik_admin yönetir, tüm roller görür). Hastaya atanan
-- hasta_protokol'den (tekil tedavi + tarih aralığı) FARKLI bir kavram: burada
-- tek bir isim altında birden fazla tedavi adımı sıralı olarak tanımlanıyor,
-- hastaya uygulama/atama akışı bu turda kapsam dışı (sadece tanım/katalog).

-- 1) tedavi_protokolu
CREATE TABLE IF NOT EXISTS tedavi_protokolu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  aciklama text,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tedavi_protokolu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tedavi_protokolu_klinik_id ON tedavi_protokolu(klinik_id);

DROP TRIGGER IF EXISTS trg_tedavi_protokolu_updated_at ON tedavi_protokolu;
CREATE TRIGGER trg_tedavi_protokolu_updated_at
  BEFORE UPDATE ON tedavi_protokolu FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) tedavi_protokolu_adimi (sıralı tedavi/işlem adımları)
CREATE TABLE IF NOT EXISTS tedavi_protokolu_adimi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  tedavi_protokolu_id uuid NOT NULL REFERENCES tedavi_protokolu(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE RESTRICT,
  sira integer NOT NULL CHECK (sira > 0),
  adim_notu text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tedavi_protokolu_id, sira)
);
ALTER TABLE tedavi_protokolu_adimi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tedavi_protokolu_adimi_klinik_id ON tedavi_protokolu_adimi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_tedavi_protokolu_adimi_protokol_id ON tedavi_protokolu_adimi(tedavi_protokolu_id);

-- klinik_id, mevcut derive_klinik_id_from_parent() generic trigger'ıyla
-- tedavi_protokolu'ndan türetiliyor (client'ın gönderdiği değere güvenilmez).
DROP TRIGGER IF EXISTS trg_tedavi_protokolu_adimi_klinik_id ON tedavi_protokolu_adimi;
CREATE TRIGGER trg_tedavi_protokolu_adimi_klinik_id
  BEFORE INSERT ON tedavi_protokolu_adimi
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('tedavi_protokolu', 'tedavi_protokolu_id');

-- 3) RLS policy'leri — islem_tanimi ile aynı desen: herkes görür, sadece
-- klinik_admin yönetir (fiyat kataloğu/tanım ekranı, günlük operasyon değil).
DROP POLICY IF EXISTS "tedavi_protokolu_select_klinik" ON tedavi_protokolu;
CREATE POLICY "tedavi_protokolu_select_klinik" ON tedavi_protokolu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "tedavi_protokolu_yonet_admin" ON tedavi_protokolu;
CREATE POLICY "tedavi_protokolu_yonet_admin" ON tedavi_protokolu
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "tedavi_protokolu_adimi_select_klinik" ON tedavi_protokolu_adimi;
CREATE POLICY "tedavi_protokolu_adimi_select_klinik" ON tedavi_protokolu_adimi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "tedavi_protokolu_adimi_yonet_admin" ON tedavi_protokolu_adimi;
CREATE POLICY "tedavi_protokolu_adimi_yonet_admin" ON tedavi_protokolu_adimi
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
--   AND table_name IN ('tedavi_protokolu', 'tedavi_protokolu_adimi');
-- SELECT policyname FROM pg_policies WHERE tablename IN ('tedavi_protokolu', 'tedavi_protokolu_adimi');
