-- Hasta Detayı > "Talep ve Öneriler" popup'ı artık salt-okunur değil, panel
-- personelinin (telefonla gelen bir talebi) hasta adına GİRDİĞİ bir form:
-- Randevu Talebi, Randevu İptali, Terapist Yorumu, Randevu Hakkında Yorum.
--
-- (1) randevu_talebi / randevu_iptal_talebi'ne şu ana kadar SADECE portal
-- (hasta_kullanici, current_hasta_id()) INSERT edebiliyordu — panelden staff
-- INSERT policy'si hiç yoktu. Additive (permissive OR) iki yeni policy.
--
-- (2) "Terapist Yorumu" ve "Randevu Hakkında Yorum" için hiç karşılığı olan
-- bir tablo yok — yeni hasta_yorum tablosu, seans_degerlendirme'deki
-- "klinik_id + hasta_id randevu'dan türetilir" deseniyle (client bu ikisini
-- hiç göndermiyor/gönderemiyor).

DROP POLICY IF EXISTS "randevu_talebi_insert_klinik" ON randevu_talebi;
CREATE POLICY "randevu_talebi_insert_klinik" ON randevu_talebi
  FOR INSERT WITH CHECK (
    klinik_id = current_klinik_id()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
  );

DROP POLICY IF EXISTS "randevu_iptal_talebi_insert_klinik" ON randevu_iptal_talebi;
CREATE POLICY "randevu_iptal_talebi_insert_klinik" ON randevu_iptal_talebi
  FOR INSERT WITH CHECK (
    klinik_id = current_klinik_id()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
    AND EXISTS (
      SELECT 1 FROM randevu r
      WHERE r.id = randevu_iptal_talebi.randevu_id
        AND r.hasta_id = randevu_iptal_talebi.hasta_id
        AND r.klinik_id = current_klinik_id()
        AND r.durum = 'planlandi'
    )
  );

CREATE TABLE IF NOT EXISTS hasta_yorum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  hasta_id uuid NOT NULL REFERENCES hasta(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL REFERENCES randevu(id) ON DELETE CASCADE,
  tur text NOT NULL CHECK (tur IN ('terapist_yorumu', 'randevu_yorumu')),
  yorum text NOT NULL,
  olusturan_kullanici_id uuid NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hasta_yorum ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_hasta_yorum_hasta_id ON hasta_yorum(hasta_id);
CREATE INDEX IF NOT EXISTS idx_hasta_yorum_klinik_id ON hasta_yorum(klinik_id);
CREATE INDEX IF NOT EXISTS idx_hasta_yorum_randevu_id ON hasta_yorum(randevu_id);

CREATE OR REPLACE FUNCTION hasta_yorum_alanlari_doldur()
RETURNS trigger AS $$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = NEW.randevu_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;
  NEW.klinik_id := v_randevu.klinik_id;
  NEW.hasta_id := v_randevu.hasta_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_hasta_yorum_alanlari_doldur ON hasta_yorum;
CREATE TRIGGER trg_hasta_yorum_alanlari_doldur
  BEFORE INSERT ON hasta_yorum
  FOR EACH ROW EXECUTE FUNCTION hasta_yorum_alanlari_doldur();

DROP POLICY IF EXISTS "hasta_yorum_select_klinik" ON hasta_yorum;
CREATE POLICY "hasta_yorum_select_klinik" ON hasta_yorum
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "hasta_yorum_insert_klinik" ON hasta_yorum;
CREATE POLICY "hasta_yorum_insert_klinik" ON hasta_yorum
  FOR INSERT WITH CHECK (
    klinik_id = current_klinik_id()
    AND olusturan_kullanici_id = auth.uid()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
  );

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'hasta_yorum';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('hasta_yorum','randevu_talebi','randevu_iptal_talebi') ORDER BY tablename, policyname;
