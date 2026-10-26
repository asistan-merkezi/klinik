-- Süper kullanıcıyla, `postgres` veritabanında çalışır (scripts/db-kur.ps1). Şifreler psql değişkeniyle gelir; dosyaya YAZILMAZ:
--   -v uygulama_sifre=... -v bakim_sifre=... -v yedek_sifre=...
-- Rol ayrıntıları ve gerekçeler: docs/sunucu-kurulum.md "Veritabanı rolleri".
CREATE ROLE klinik_sahip NOLOGIN NOSUPERUSER NOBYPASSRLS;     -- nesne sahibi (migration SET ROLE ile bu rolle çalışır)
CREATE ROLE klinik_uygulama LOGIN PASSWORD :'uygulama_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE klinik_anonim NOLOGIN NOSUPERUSER NOBYPASSRLS;     -- giriş öncesi akışlar; uygulama SET LOCAL ROLE ile geçer
GRANT klinik_anonim TO klinik_uygulama WITH INHERIT FALSE, SET TRUE;
-- bakim_rolu: BYPASSRLS DEĞİL. Yalnız klinik listesi (id, ad) + bakım fonksiyonları; klinik başına iş SET LOCAL ROLE klinik_uygulama + app.tenant_id ile.
CREATE ROLE bakim_rolu LOGIN PASSWORD :'bakim_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT klinik_uygulama TO bakim_rolu WITH INHERIT FALSE, SET TRUE;
-- klinik_yedek: pg_dump FORCE RLS altında BYPASSRLS ister. TEK izinli BYPASSRLS rolü (onay bekliyor: docs/tasima-plani.md).
CREATE ROLE klinik_yedek LOGIN PASSWORD :'yedek_sifre' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT pg_read_all_data TO klinik_yedek;
