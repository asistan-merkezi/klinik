-- Düzeltme: musteri_portal.sql'de musteri tablosuna sadece SELECT policy'si
-- eklenmişti, UPDATE eksikti — portaldan cinsiyet/eposta/rıza güncellemeleri
-- RLS tarafından sessizce (hatasız, 0 satır) engelleniyordu. İdempotent, tek blok.

DROP POLICY IF EXISTS "musteri_update_portal" ON musteri;
CREATE POLICY "musteri_update_portal" ON musteri
  FOR UPDATE USING (id = current_musteri_id())
  WITH CHECK (id = current_musteri_id());

-- Kontrol:
-- SELECT policyname FROM pg_policies WHERE tablename = 'musteri';
