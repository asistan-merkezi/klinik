-- Ayarlar > Şirket Bilgileri: fatura/kurumsal profil alanları. `ad` (kliniğin
-- panelde görünen kısa adı) ile karışmasın diye resmi unvan ayrı kolon.
-- logo_url zaten vardı (beyaz etiket için); burada gerçek bir yükleme akışı
-- (Storage) ile dolduruluyor.
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS unvan text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS adres text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS vergi_dairesi text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS vergi_no text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS telefon text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS whatsapp_no text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS eposta text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS yetkili_kisi text;

-- Logo yüklemesi için public bucket (hassas veri değil, marka görseli —
-- portal/tablet/rapor gibi yerlerde gösterilecek; public URL ile servis edilir).
INSERT INTO storage.buckets (id, name, public)
VALUES ('klinik-logo', 'klinik-logo', true)
ON CONFLICT (id) DO NOTHING;

-- Yükleme yolu {klinik_id}/logo.<uzanti> şeklinde olmalı; sadece klinik_admin
-- kendi klasörüne yazabilir. Okuma bucket public olduğu için RLS'e tabi değil.
DROP POLICY IF EXISTS "klinik_logo_yukle_admin" ON storage.objects;
CREATE POLICY "klinik_logo_yukle_admin" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'klinik-logo'
    AND (storage.foldername(name))[1] = current_klinik_id()::text
    AND current_rol() = 'klinik_admin'
  );

DROP POLICY IF EXISTS "klinik_logo_guncelle_admin" ON storage.objects;
CREATE POLICY "klinik_logo_guncelle_admin" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'klinik-logo'
    AND (storage.foldername(name))[1] = current_klinik_id()::text
    AND current_rol() = 'klinik_admin'
  );

DROP POLICY IF EXISTS "klinik_logo_sil_admin" ON storage.objects;
CREATE POLICY "klinik_logo_sil_admin" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'klinik-logo'
    AND (storage.foldername(name))[1] = current_klinik_id()::text
    AND current_rol() = 'klinik_admin'
  );
