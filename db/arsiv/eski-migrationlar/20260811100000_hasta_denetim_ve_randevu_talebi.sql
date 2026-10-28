-- Hasta Portalı genişletmesi: (B) kişisel bilgi değişiklik denetimi + (C) randevu talebi.
--
-- (B) hasta tablosuna, hasta_hassas'takiyle BİREBİR aynı 4 denetim kolonu
-- eklendi ve AYNI (var olan) trigger fonksiyonu (hasta_hassas_denetim_bilgisi_ata,
-- bkz. 20260731111500) yeniden kullanıldı — bu fonksiyon zaten tabloya özel
-- bir kolon adı içermiyor, sadece NEW.son_guncelleyen_tip/_kullanici_id ve
-- NEW.olusturan_tip/_kullanici_id set ediyor, current_rol()/current_hasta_id()
-- session'ından türetiyor. Yeni bir fonksiyon YAZILMADI.
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS olusturan_tip text CHECK (olusturan_tip IN ('personel', 'hasta'));
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS olusturan_kullanici_id uuid;
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS son_guncelleyen_tip text CHECK (son_guncelleyen_tip IN ('personel', 'hasta'));
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS son_guncelleyen_kullanici_id uuid;

DROP TRIGGER IF EXISTS trg_hasta_denetim ON hasta;
CREATE TRIGGER trg_hasta_denetim
  BEFORE INSERT OR UPDATE ON hasta
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_denetim_bilgisi_ata();

-- ============================================================
-- (C) randevu_talebi — randevu_iptal_talebi'nin ikizi ama var olan bir
-- randevuya değil, hastaya bağlı (henüz randevu yok, oluşturulacak).
-- ============================================================
CREATE TABLE IF NOT EXISTS randevu_talebi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,
  hasta_id uuid NOT NULL REFERENCES hasta(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id),
  tercih_tarih date NOT NULL,
  tercih_saat time,
  terapist_id uuid REFERENCES terapist(id) ON DELETE SET NULL,
  not_metni text,
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi')),
  olusturulan_randevu_id uuid REFERENCES randevu(id) ON DELETE SET NULL,
  yanit_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  yanit_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE randevu_talebi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_randevu_talebi_klinik_id ON randevu_talebi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_randevu_talebi_hasta_id ON randevu_talebi(hasta_id);

-- klinik_id, randevu_iptal_talebi_klinik_id_ata() ile aynı fikirde ama
-- randevu yerine hasta'dan türetiliyor (client değerine güvenilmez).
CREATE OR REPLACE FUNCTION randevu_talebi_klinik_id_ata()
RETURNS trigger AS $$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM hasta WHERE id = NEW.hasta_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_randevu_talebi_klinik_id ON randevu_talebi;
CREATE TRIGGER trg_randevu_talebi_klinik_id
  BEFORE INSERT ON randevu_talebi
  FOR EACH ROW EXECUTE FUNCTION randevu_talebi_klinik_id_ata();

DROP POLICY IF EXISTS "randevu_talebi_insert_portal" ON randevu_talebi;
CREATE POLICY "randevu_talebi_insert_portal" ON randevu_talebi
  FOR INSERT WITH CHECK (hasta_id = current_hasta_id());

DROP POLICY IF EXISTS "randevu_talebi_select_portal" ON randevu_talebi;
CREATE POLICY "randevu_talebi_select_portal" ON randevu_talebi
  FOR SELECT USING (hasta_id = current_hasta_id());

DROP POLICY IF EXISTS "randevu_talebi_select_klinik" ON randevu_talebi;
CREATE POLICY "randevu_talebi_select_klinik" ON randevu_talebi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_talebi_update_klinik" ON randevu_talebi;
CREATE POLICY "randevu_talebi_update_klinik" ON randevu_talebi
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- Portal'daki mevcut islem_tanimi_select_portal policy'si (20260727200000)
-- SADECE hastanın GEÇMİŞTE ödediği tedavilerle sınırlı (odeme_kalemi join'i)
-- — randevu talebi formunda hasta hiç almadığı bir tedaviyi de talep
-- edebilmeli. Additive (permissive OR) yeni bir SELECT policy: sadece
-- kendi kliniğindeki AKTİF tedavi katalog verisini (isim/fiyat, hassas
-- olmayan) açıyor, mevcut dar policy'ye DOKUNULMUYOR.
DROP POLICY IF EXISTS "islem_tanimi_select_portal_katalog" ON islem_tanimi;
CREATE POLICY "islem_tanimi_select_portal_katalog" ON islem_tanimi
  FOR SELECT USING (
    aktif = true
    AND klinik_id = (SELECT klinik_id FROM hasta WHERE id = current_hasta_id())
  );

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta' AND column_name LIKE '%guncelleyen%';
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'randevu_talebi';
-- SELECT policyname FROM pg_policies WHERE tablename IN ('randevu_talebi','islem_tanimi') ORDER BY tablename, policyname;
