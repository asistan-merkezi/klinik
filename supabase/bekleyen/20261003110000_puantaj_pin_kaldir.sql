-- ADIM B — HENÜZ UYGULAMAYIN. Bu dosya BİLİNÇLİ olarak supabase/migrations/
-- DIŞINDA durur (db push yanlışlıkla uygulamasın diye).
--
-- Uygulama sırası:
--   1) 20261003100000_personel_puantaj_kendi_kaydet.sql canlıya uygulanır.
--   2) Oturumlu QR akışı (puantajKendiKaydet) deploy edilir ve canlıda doğrulanır
--      (giriş + çıkış kaydı, ikinci giriş reddi).
--   3) O ZAMAN bu dosya supabase/migrations/ altına taşınıp uygulanır.
-- Deploy'dan önce uygulanırsa canlıdaki eski QR akışı (puantajPinIleKaydet)
-- ve personel kartındaki PIN formu "function not found" ile kırılır.
--
-- Ön kontrol (kalıntı yok olmalı — 0 satır):
-- SELECT viewname FROM pg_views WHERE definition ILIKE '%puantaj_pin%';
-- SELECT proname FROM pg_proc WHERE prosrc ILIKE '%puantaj_pin_hash%'
--   AND proname NOT LIKE 'personel_puantaj_pin_%';

DROP FUNCTION IF EXISTS personel_puantaj_pin_ile_kaydet(uuid, text, text);
DROP FUNCTION IF EXISTS personel_puantaj_pin_belirle(uuid, text);
DROP FUNCTION IF EXISTS personel_puantaj_pin_sifirla(uuid);
ALTER TABLE personel DROP COLUMN IF EXISTS puantaj_pin_hash;
ALTER TABLE personel DROP COLUMN IF EXISTS puantaj_pin_guncelleme_tarihi;
-- 'self_qr' kaynağı kalır (kapı QR'ından kendi oturumuyla yapılan kayıt).
