-- Müşteri Portalı (temel): musteri_kullanici (portal login, resepsiyon ilk
-- şifreyi atar — WhatsApp/SMS OTP sağlayıcısı henüz yok, bkz. CLAUDE.md),
-- randevu_iptal_talebi (müşteri iptal talep eder, resepsiyon onaylar/reddeder).
-- current_musteri_id() helper + mevcut tablolara portal SELECT policy'leri
-- (staff'ın klinik_id bazlı policy'lerine ADDITIVE — permissive OR ile birleşir).
-- İdempotent, tek blok.

-- 1) musteri_kullanici (id = auth.users.id, kullanici tablosuyla aynı desen)
CREATE TABLE IF NOT EXISTS musteri_kullanici (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL UNIQUE REFERENCES musteri(id) ON DELETE CASCADE,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_kullanici ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_kullanici_musteri_id ON musteri_kullanici(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_kullanici_updated_at ON musteri_kullanici;
CREATE TRIGGER trg_musteri_kullanici_updated_at
  BEFORE UPDATE ON musteri_kullanici FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2) current_musteri_id(): portal oturumunun bağlı olduğu musteri_id (pasif hesap NULL döner)
CREATE OR REPLACE FUNCTION current_musteri_id()
RETURNS uuid AS $$
  SELECT musteri_id FROM musteri_kullanici WHERE id = auth.uid() AND aktif = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3) portal_giris_epostasi: telefon -> sentetik e-posta (anon çağırabilir; auth.users
-- id'si musteri oluşturulurken bilinmediği için e-posta musteri.id'den türetilir,
-- bkz. app/portal/[id]/actions.ts createUser çağrısı — format birebir aynı olmalı).
CREATE OR REPLACE FUNCTION portal_giris_epostasi(p_telefon text)
RETURNS text AS $$
  SELECT 'm-' || m.id::text || '@portal.local'
  FROM musteri m
  JOIN musteri_kullanici mk ON mk.musteri_id = m.id
  WHERE m.telefon = p_telefon AND mk.aktif = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION portal_giris_epostasi(text) TO anon, authenticated;

-- 4) musteri_kullanici RLS: kendi kaydı + klinik_admin/resepsiyon görür;
-- aktif/pasif toggle klinik_admin/resepsiyon (erişimi uzaktan kapatabilir);
-- satır oluşturma sadece service role (auth.admin.createUser sonrası backend'den).
DROP POLICY IF EXISTS "musteri_kullanici_select" ON musteri_kullanici;
CREATE POLICY "musteri_kullanici_select" ON musteri_kullanici
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM musteri m
      WHERE m.id = musteri_kullanici.musteri_id
        AND m.klinik_id = current_klinik_id()
        AND current_rol() IN ('klinik_admin', 'resepsiyon')
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_kullanici_update_klinik" ON musteri_kullanici;
CREATE POLICY "musteri_kullanici_update_klinik" ON musteri_kullanici
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM musteri m
      WHERE m.id = musteri_kullanici.musteri_id
        AND m.klinik_id = current_klinik_id()
        AND current_rol() IN ('klinik_admin', 'resepsiyon')
    ) OR is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM musteri m
      WHERE m.id = musteri_kullanici.musteri_id
        AND m.klinik_id = current_klinik_id()
        AND current_rol() IN ('klinik_admin', 'resepsiyon')
    ) OR is_super_admin()
  );

-- 5) randevu_iptal_talebi: müşteri kendi planlı randevusu için talep oluşturur,
-- klinik_id trigger ile randevu'dan türetilir (client'ın gönderdiği değere güvenilmez).
CREATE TABLE IF NOT EXISTS randevu_iptal_talebi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL UNIQUE REFERENCES randevu(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi')),
  yanit_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  yanit_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE randevu_iptal_talebi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_randevu_iptal_talebi_klinik_id ON randevu_iptal_talebi(klinik_id);

CREATE OR REPLACE FUNCTION randevu_iptal_talebi_klinik_id_ata()
RETURNS trigger AS $$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM randevu WHERE id = NEW.randevu_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_randevu_iptal_talebi_klinik_id ON randevu_iptal_talebi;
CREATE TRIGGER trg_randevu_iptal_talebi_klinik_id
  BEFORE INSERT ON randevu_iptal_talebi
  FOR EACH ROW EXECUTE FUNCTION randevu_iptal_talebi_klinik_id_ata();

DROP POLICY IF EXISTS "randevu_iptal_talebi_insert_portal" ON randevu_iptal_talebi;
CREATE POLICY "randevu_iptal_talebi_insert_portal" ON randevu_iptal_talebi
  FOR INSERT WITH CHECK (
    musteri_id = current_musteri_id()
    AND EXISTS (
      SELECT 1 FROM randevu r
      WHERE r.id = randevu_iptal_talebi.randevu_id
        AND r.musteri_id = current_musteri_id()
        AND r.durum = 'planlandi'
    )
  );

DROP POLICY IF EXISTS "randevu_iptal_talebi_select_portal" ON randevu_iptal_talebi;
CREATE POLICY "randevu_iptal_talebi_select_portal" ON randevu_iptal_talebi
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "randevu_iptal_talebi_select_klinik" ON randevu_iptal_talebi;
CREATE POLICY "randevu_iptal_talebi_select_klinik" ON randevu_iptal_talebi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_iptal_talebi_update_klinik" ON randevu_iptal_talebi;
CREATE POLICY "randevu_iptal_talebi_update_klinik" ON randevu_iptal_talebi
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- 6) Mevcut tablolara ADDITIVE portal SELECT policy'leri (permissive OR ile birleşir;
-- staff'ın current_klinik_id() bazlı erişimini değiştirmez).
DROP POLICY IF EXISTS "musteri_select_portal" ON musteri;
CREATE POLICY "musteri_select_portal" ON musteri
  FOR SELECT USING (id = current_musteri_id());

DROP POLICY IF EXISTS "randevu_select_portal" ON randevu;
CREATE POLICY "randevu_select_portal" ON randevu
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "paket_satis_select_portal" ON paket_satis;
CREATE POLICY "paket_satis_select_portal" ON paket_satis
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "paket_select_portal" ON paket;
CREATE POLICY "paket_select_portal" ON paket
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM paket_satis ps WHERE ps.paket_id = paket.id AND ps.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "odeme_select_portal" ON odeme;
CREATE POLICY "odeme_select_portal" ON odeme
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "odeme_kalemi_select_portal" ON odeme_kalemi;
CREATE POLICY "odeme_kalemi_select_portal" ON odeme_kalemi
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM odeme o WHERE o.id = odeme_kalemi.odeme_id AND o.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "odeme_satiri_select_portal" ON odeme_satiri;
CREATE POLICY "odeme_satiri_select_portal" ON odeme_satiri
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM odeme o WHERE o.id = odeme_satiri.odeme_id AND o.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "musteri_bakiye_hareket_select_portal" ON musteri_bakiye_hareket;
CREATE POLICY "musteri_bakiye_hareket_select_portal" ON musteri_bakiye_hareket
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "islem_tanimi_select_portal" ON islem_tanimi;
CREATE POLICY "islem_tanimi_select_portal" ON islem_tanimi
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM odeme_kalemi ok JOIN odeme o ON o.id = ok.odeme_id
      WHERE ok.islem_tanimi_id = islem_tanimi.id AND o.musteri_id = current_musteri_id()
    )
  );

DROP POLICY IF EXISTS "terapist_select_portal" ON terapist;
CREATE POLICY "terapist_select_portal" ON terapist
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM randevu r WHERE r.terapist_id = terapist.id AND r.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "personel_select_portal" ON personel;
CREATE POLICY "personel_select_portal" ON personel
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM terapist t JOIN randevu r ON r.terapist_id = t.id
      WHERE t.personel_id = personel.id AND r.musteri_id = current_musteri_id()
    )
  );

DROP POLICY IF EXISTS "oda_select_portal" ON oda;
CREATE POLICY "oda_select_portal" ON oda
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM randevu r WHERE r.oda_id = oda.id AND r.musteri_id = current_musteri_id())
  );

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname IN ('current_musteri_id', 'portal_giris_epostasi');
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE '%portal%';
