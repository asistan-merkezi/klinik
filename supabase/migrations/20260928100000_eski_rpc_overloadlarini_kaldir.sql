-- CREATE OR REPLACE FUNCTION'a yeni (DEFAULT'lu) bir parametre eklemek Postgres'te
-- mevcut fonksiyonu DEĞİŞTİRMEZ, farklı imzalı İKİNCİ bir overload yaratır.
-- Eski imzanın kabul ettiği her anahtar kümesini yeni imza da kabul ettiğinden
-- PostgREST o çağrılarda aday seçemez: PGRST203 "Could not choose the best
-- candidate function".
--
-- randevu_seans_bedelini_isle: 20260928091500 p_belge_turu ekledi, 6 parametreli
-- eski hâli (20260927150000) kaldı. Canlıda doğrulandı (2026-09-28): yalnız
-- p_randevu_id ile yapılan "Cariye Ekle" çağrısı PGRST203 döndürüyordu.
--
-- personel_hesap_hareket_ekle: 20260916090000 p_odeme_tipi/p_banka_hesap_id
-- ekledi, 5 parametreli eski hâli (20260818093000) kaldı. Tüm uygulama
-- çağrıları 7 anahtarı da gönderdiği için şu an kırık değil, ama eski hâl
-- odeme_tipi yazmayan, SECURITY DEFINER, hâlâ çağrılabilir bir kopya.
--
-- İdempotent, tek blok. Uygulama kodu her iki durumda da (öncesi/sonrası) çalışır.

DROP FUNCTION IF EXISTS public.randevu_seans_bedelini_isle(uuid, numeric, text, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.personel_hesap_hareket_ekle(uuid, text, numeric, date, text);

-- PostgREST şema önbelleğini yenile
NOTIFY pgrst, 'reload schema';

-- Kontrol (her biri tek satır dönmeli):
-- SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--   WHERE proname IN ('randevu_seans_bedelini_isle', 'personel_hesap_hareket_ekle');
