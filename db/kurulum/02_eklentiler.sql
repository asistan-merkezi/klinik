-- Süper kullanıcıyla, `klinik` veritabanında. Eklentiler ve `extensions` şeması (referansla aynı yerleşim).
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION klinik_sahip;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
GRANT USAGE ON SCHEMA public, extensions TO klinik_uygulama, kimlik_rolu, klinik_anonim, klinik_tanima, bakim_rolu, klinik_yedek;
