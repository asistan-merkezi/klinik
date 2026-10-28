-- Terapist Maaş + Performans modülü: terapist tablosuna prim/baraj parametreleri
-- eklenir (işlem_basi_prim/barajli_prim modelleri şimdilik SEANS SAYISI bazlıdır —
-- odeme_kalemi'nin randevu/terapist ile ilişkisi yok, ciro bazlı % prim bu turda
-- kapsam dışı bırakıldı, kullanıcı kararı); personel_ekstra_hakedis tablosu (yol/
-- yemek/mesai/diğer) + RLS eklenir. İdempotent, tek blok.

-- 1) terapist: prim/baraj parametreleri
ALTER TABLE terapist ADD COLUMN IF NOT EXISTS prim_sabit_tutar numeric(10, 2) CHECK (prim_sabit_tutar >= 0);
ALTER TABLE terapist ADD COLUMN IF NOT EXISTS baraj_seans_sayisi integer CHECK (baraj_seans_sayisi > 0);
ALTER TABLE terapist ADD COLUMN IF NOT EXISTS baraj_bonus_tutari numeric(10, 2) CHECK (baraj_bonus_tutari >= 0);

-- 2) personel_ekstra_hakedis (yol/yemek/mesai/diğer — bordroya eklenen ekstra hakedişler)
CREATE TABLE IF NOT EXISTS personel_ekstra_hakedis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  tur text NOT NULL CHECK (tur IN ('yol', 'yemek', 'mesai', 'diger')),
  tutar numeric(10, 2) NOT NULL CHECK (tutar >= 0),
  tarih date NOT NULL DEFAULT current_date,
  aciklama text,
  ekleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE personel_ekstra_hakedis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_ekstra_hakedis_klinik_id ON personel_ekstra_hakedis(klinik_id);
CREATE INDEX IF NOT EXISTS idx_personel_ekstra_hakedis_personel_id ON personel_ekstra_hakedis(personel_id);
CREATE INDEX IF NOT EXISTS idx_personel_ekstra_hakedis_tarih ON personel_ekstra_hakedis(tarih);

DROP TRIGGER IF EXISTS trg_personel_ekstra_hakedis_updated_at ON personel_ekstra_hakedis;
CREATE TRIGGER trg_personel_ekstra_hakedis_updated_at
  BEFORE UPDATE ON personel_ekstra_hakedis FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) RLS: görüntüleme klinik_admin + ilgili personelin kendisi; yönetim (ekleme/düzenleme/silme) sadece klinik_admin
DROP POLICY IF EXISTS "personel_ekstra_hakedis_select" ON personel_ekstra_hakedis;
CREATE POLICY "personel_ekstra_hakedis_select" ON personel_ekstra_hakedis
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR EXISTS (
      SELECT 1 FROM personel p WHERE p.id = personel_ekstra_hakedis.personel_id AND p.kullanici_id = auth.uid()
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_ekstra_hakedis_yonet_admin" ON personel_ekstra_hakedis;
CREATE POLICY "personel_ekstra_hakedis_yonet_admin" ON personel_ekstra_hakedis
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'terapist' AND column_name LIKE '%prim%' OR column_name LIKE '%baraj%';
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'personel_ekstra_hakedis';
