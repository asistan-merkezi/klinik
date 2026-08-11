-- Hastalar > Bildirimler: resepsiyon/klinik_admin'in hasta portalından gelen
-- randevu iptal/talep taleplerini, seans sonu değerlendirmeleri ve Anket ve
-- Öneriler yanıtlarını tek bir ekranda görmesi için. randevu_iptal_talebi ve
-- randevu_talebi zaten 'bekliyor' durum alanına sahip (o durum "işlenmedi"
-- sinyali olarak kullanılıyor); anket_yaniti ve seans_degerlendirme'nin böyle
-- bir durum alanı yok, bu yüzden ikisine de "görüldü mü" için nullable bir
-- goruldu_tarihi eklendi — Bildirimler sayfası açılınca (client mount, sadece
-- gerçek navigasyonda, Link prefetch'te DEĞİL) o an listedeki satırlar
-- işaretleniyor.
ALTER TABLE anket_yaniti ADD COLUMN IF NOT EXISTS goruldu_tarihi timestamptz;
ALTER TABLE seans_degerlendirme ADD COLUMN IF NOT EXISTS goruldu_tarihi timestamptz;

-- Önceden SADECE klinik_admin görebiliyordu (Ayarlar > QR Kodları > Anket ve
-- Öneriler ekranı hâlâ klinik_admin-only redirect ile korunuyor, bu sadece
-- RLS'i genişletiyor) — Bildirimler ekranı resepsiyon'a da açık olduğu için
-- ikisine de resepsiyon eklendi.
DROP POLICY IF EXISTS "anket_yaniti_select_admin" ON anket_yaniti;
CREATE POLICY "anket_yaniti_select_admin" ON anket_yaniti
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "anket_yaniti_update_goruldu" ON anket_yaniti;
CREATE POLICY "anket_yaniti_update_goruldu" ON anket_yaniti
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "seans_degerlendirme_select_admin" ON seans_degerlendirme;
CREATE POLICY "seans_degerlendirme_select_admin" ON seans_degerlendirme
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "seans_degerlendirme_update_goruldu" ON seans_degerlendirme;
CREATE POLICY "seans_degerlendirme_update_goruldu" ON seans_degerlendirme
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name IN ('anket_yaniti','seans_degerlendirme') AND column_name = 'goruldu_tarihi';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename IN ('anket_yaniti','seans_degerlendirme') ORDER BY tablename, cmd;
