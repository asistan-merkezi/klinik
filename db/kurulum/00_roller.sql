-- Süper kullanıcıyla, `postgres` veritabanında çalışır (scripts/db-kur.ps1). Şifreler psql değişkeniyle gelir; dosyaya YAZILMAZ:
--   -v uygulama_sifre=... -v kimlik_sifre=... -v bakim_sifre=... -v yedek_sifre=... -v migrasyon_sifre=...
-- Rol ayrıntıları ve gerekçeler: docs/sunucu-kurulum.md "Veritabanı rolleri".
CREATE ROLE klinik_sahip NOLOGIN NOSUPERUSER NOBYPASSRLS;     -- nesne sahibi (migration SET ROLE ile bu rolle çalışır)
CREATE ROLE klinik_uygulama LOGIN PASSWORD :'uygulama_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
-- kimlik_rolu: Better Auth'un bağlantısı. kimlik_kullanici/oturum/kimlik_hesap/kimlik_dogrulama'nın TEK erişimcisi; başka hiçbir tabloya yetkisi yok.
CREATE ROLE kimlik_rolu LOGIN PASSWORD :'kimlik_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
-- klinik_tanima: giriş öncesi, TENANT'SIZ çözümleme (kısa kod -> klinik, randevu -> klinik) için dar fonksiyon sahibi.
-- Yalnız klinik(id, ad, qr_kisa_kod) ve randevu(id, klinik_id) kolonlarını okuyabilir; BYPASSRLS değil; giriş yapamaz.
CREATE ROLE klinik_tanima NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE klinik_anonim NOLOGIN NOSUPERUSER NOBYPASSRLS;     -- giriş öncesi akışlar; uygulama SET LOCAL ROLE ile geçer
GRANT klinik_anonim TO klinik_uygulama WITH INHERIT FALSE, SET TRUE;
GRANT klinik_tanima TO klinik_sahip WITH INHERIT FALSE, SET TRUE;   -- tanima şemasını/fonksiyonlarını kurmak için
-- bakim_rolu: BYPASSRLS DEĞİL. Yalnız klinik listesi (id, ad) + bakım fonksiyonları; klinik başına iş SET LOCAL ROLE klinik_uygulama + app.tenant_id ile.
CREATE ROLE bakim_rolu LOGIN PASSWORD :'bakim_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT klinik_uygulama TO bakim_rolu WITH INHERIT FALSE, SET TRUE;
-- klinik_yedek: pg_dump FORCE RLS altında BYPASSRLS ister. TEK izinli BYPASSRLS rolü (onay bekliyor: docs/tasima-plani.md).
CREATE ROLE klinik_yedek LOGIN PASSWORD :'yedek_sifre' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT pg_read_all_data TO klinik_yedek;
-- klinik_migrasyon: MIGRATION UYGULAYICI (deploy/windows/migrasyon-uygula.ps1). Süper kullanıcının yerine geçer: süper kullanıcı yalnız ilk kurulumda
-- (roller, veritabanı, eklentiler) kullanılır. Yetkisi YALNIZ klinik_sahip rolüne SET ROLE edebilmektir (kendi başına hiçbir tablo/şema yetkisi, BYPASSRLS, rol/DB oluşturma yok).
-- Migration'lar nesne sahibi olarak çalışır (SET ROLE klinik_sahip). Girişi yalnız localhost (pg_hba). Eklenti/rol/veritabanı oluşturan migration YAZILMAZ (bunlar kurulum betiğindedir).
CREATE ROLE klinik_migrasyon LOGIN PASSWORD :'migrasyon_sifre' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT klinik_sahip TO klinik_migrasyon WITH INHERIT FALSE, SET TRUE;
