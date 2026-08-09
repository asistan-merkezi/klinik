-- klinik-logo bucket'ının storage.objects RLS'inde INSERT/UPDATE/DELETE vardı ama
-- SELECT hiç yoktu (diğer bucket'ların — musteri-belge, personel-belge — dördü de
-- tanımlıydı, bu unutulmuştu). Supabase Storage'ın upsert:true akışı, objenin
-- var olup olmadığını RLS'e tabi bir SELECT ile kontrol ediyor; SELECT policy'si
-- olmadan bu kontrol engellenip "new row violates row-level security policy"
-- hatasıyla upsert her denemede reddediliyordu (canlıda service-role dışı
-- authenticated istekle doğrulandı) — Şirket Bilgileri'ndeki logo yükleme
-- .upload(..., {upsert:true}) kullandığı için tek bir yükleme bile hiç
-- başarılı olamıyordu.
DROP POLICY IF EXISTS "klinik_logo_oku_admin" ON storage.objects;
CREATE POLICY "klinik_logo_oku_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'klinik-logo'
    AND (storage.foldername(name))[1] = current_klinik_id()::text
    AND current_rol() = 'klinik_admin'
  );
