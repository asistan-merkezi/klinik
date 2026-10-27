-- Süper kullanıcıyla, postgres veritabanında. CREATE DATABASE transaction içinde olamaz, psql -f ile her ifade ayrı çalışır.
-- Sıralama C collation: sıralama zaten collation'a güvenmez (turkce_sira_anahtari), Türkçe Windows'ta initdb locale adı sorun çıkarabilir.
CREATE DATABASE klinik OWNER klinik_sahip ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
REVOKE ALL ON DATABASE klinik FROM PUBLIC;
GRANT CONNECT ON DATABASE klinik TO klinik_uygulama, kimlik_rolu, klinik_anonim, bakim_rolu, klinik_yedek;
