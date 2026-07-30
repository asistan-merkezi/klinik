-- Detaylı Bilgiler & Anamnez kartına anne/baba (veli) alanları eklendi.
-- Ayrıca gerçek bir RLS hatası düzeltildi: app/(app)/panel/hastalar/[id]/actions.ts
-- içindeki detayliBilgileriGuncelle, terapistDahilYetkiliHastaGetir ile terapist'in
-- de bu formu (Kişisel Bilgiler sekmesindeki "Detaylı Bilgiler & Anamnez" kartı)
-- kaydedebilmesine izin veriyordu, ama hasta_hassas_insert/hasta_hassas_update
-- policy'leri hâlâ sadece klinik_admin/resepsiyon'a izin veriyordu. Sonuç: bir
-- terapist bu formdan adres/acil durum kişisi/anamnez girip kaydettiğinde, UI
-- "kaydedildi" gösteriyordu ama hasta_hassas satırı RLS tarafından sessizce
-- güncellenmiyordu (upsert'in UPDATE dalı RLS USING koşulunu sağlamadığı için
-- hatasız 0 satır etkileniyordu) — bir sonraki ziyarette veriler "silinmiş" gibi
-- görünüyordu. Ders (CLAUDE.md'de daha önce de not edilmişti): bir action yeni
-- bir role açıldığında ilgili tablonun RLS'i (INSERT/SELECT/UPDATE/DELETE) tek
-- tek tekrar kontrol edilmeli.
-- İdempotent, tek blok.

ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS anne_adi text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS anne_telefon text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS baba_adi text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS baba_telefon text;

DROP POLICY IF EXISTS "hasta_hassas_insert" ON hasta_hassas;
CREATE POLICY "hasta_hassas_insert" ON hasta_hassas
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist'))
    OR hasta_id = current_hasta_id()
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "hasta_hassas_update" ON hasta_hassas;
CREATE POLICY "hasta_hassas_update" ON hasta_hassas
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist'))
    OR hasta_id = current_hasta_id()
    OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist'))
    OR hasta_id = current_hasta_id()
    OR is_super_admin()
  );

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_hassas' AND column_name LIKE 'anne_%' OR column_name LIKE 'baba_%';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'hasta_hassas';
