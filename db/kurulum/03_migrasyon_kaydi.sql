-- Süper kullanıcıyla, `klinik` veritabanında (kurulum, 02'den sonra). Uygulanmış migration kaydı: ayrı şema (public değil), sahibi klinik_sahip,
-- HİÇBİR uygulama rolüne yetki yok (yetki-matrisi.sql denetler). klinik_migrasyon SET ROLE klinik_sahip ile yazar; klinik_yedek (pg_read_all_data) okuyabilir.
CREATE SCHEMA IF NOT EXISTS migrasyon AUTHORIZATION klinik_sahip;
REVOKE ALL ON SCHEMA migrasyon FROM PUBLIC;
CREATE TABLE IF NOT EXISTS migrasyon.kayit (
  dosya text PRIMARY KEY,
  sha256 text NOT NULL,
  uygulandi timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE migrasyon.kayit OWNER TO klinik_sahip;
REVOKE ALL ON migrasyon.kayit FROM PUBLIC;
