-- Belgeler & Medya sekmesi için: soft delete (deleted_at) + terapist'in
-- silme yetkisinin DB seviyesinde kaldırılması ("Terapist yükleyebilir/
-- görebilir, silemez" — DAVRANIŞLAR). Ayrıca musteri_onam.imza_storage_path
-- nullable yapılıyor: "kağıt form imzalandıysa" düşen onay akışında (mevcut
-- ozel_nitelikli_veri_onay_tarihi deseniyle aynı) gerçek bir imza dosyası
-- yok — tablet imza akışı bu projede henüz kurulmadı (bkz. CLAUDE.md).
-- İdempotent, tek blok.

-- 1) musteri_belge.deleted_at
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_musteri_belge_deleted_at ON musteri_belge(deleted_at) WHERE deleted_at IS NOT NULL;

-- SELECT policy'leri soft-delete edilmiş satırları hariç tutacak şekilde
-- güncellendi (uygulama katmanına güvenilmiyor — silinmiş bir tıbbi
-- fotoğrafın herhangi bir sorgu yolundan sızması istenmiyor).
DROP POLICY IF EXISTS "musteri_belge_select_klinik" ON musteri_belge;
CREATE POLICY "musteri_belge_select_klinik" ON musteri_belge
  FOR SELECT USING ((klinik_id = current_klinik_id() AND deleted_at IS NULL) OR is_super_admin());

DROP POLICY IF EXISTS "musteri_belge_select_portal" ON musteri_belge;
CREATE POLICY "musteri_belge_select_portal" ON musteri_belge
  FOR SELECT USING (musteri_id = current_musteri_id() AND deleted_at IS NULL);

-- UPDATE (dolayısıyla soft-delete = deleted_at set etme) artık terapist'e
-- kapalı; terapist SADECE INSERT (yükleme) ve SELECT (görüntüleme) yapabilir.
DROP POLICY IF EXISTS "musteri_belge_guncelle_klinik" ON musteri_belge;
CREATE POLICY "musteri_belge_guncelle_klinik" ON musteri_belge
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- 2) musteri_onam.imza_storage_path nullable (kağıt form fallback'i için)
ALTER TABLE musteri_onam ALTER COLUMN imza_storage_path DROP NOT NULL;

-- Kontrol:
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'musteri_belge' AND column_name = 'deleted_at';
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'musteri_onam' AND column_name = 'imza_storage_path';
