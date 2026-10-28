-- Ayarlar denetimi (2026-10-12).
--
-- 1) Paraşüt client secret düz metin saklanıyor ve satır SELECT politikası klinik_admin + muhasebe'ye
--    açık — ekran secret'ı seçmese de bu iki rol tarayıcıdan PostgREST'e doğrudan sorguyla
--    (`select=parasut_client_secret`) okuyabiliyordu. Artık kolon düzeyinde SELECT yetkisi
--    secret HARİÇ veriliyor; secret yalnız sunucu (service_role) tarafından okunur/yazılır.
--    Yazma (upsert) kolon SELECT'i gerektirmez, yönetici yeni secret girebilir.
-- 2) klinik-logo bucket'ında boyut/tür sınırı yoktu (public bucket, herhangi bir dosya/boyut).

REVOKE SELECT ON klinik_muhasebe_entegrasyonu FROM authenticated, anon;
GRANT SELECT (klinik_id, parasut_client_id, parasut_company_id, baglanti_durumu, created_at, updated_at)
  ON klinik_muhasebe_entegrasyonu TO authenticated;

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
WHERE id = 'klinik-logo';

-- Doğrulama: authenticated olarak `select parasut_client_secret from klinik_muhasebe_entegrasyonu`
-- → permission denied (42501); `select parasut_client_id ...` → çalışır.
