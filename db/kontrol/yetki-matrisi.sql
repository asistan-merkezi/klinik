-- Yetki matrisi denetimi (süper kullanıcıyla çalıştırılır). Hata varsa EXCEPTION fırlatır.
-- Kurallar:
--  1) kimlik tablolarına (kimlik_kullanici, oturum, kimlik_hesap, kimlik_dogrulama) YALNIZ kimlik_rolu erişir;
--     klinik_uygulama, klinik_anonim, bakim_rolu'nün tablo VEYA kolon düzeyinde hiçbir yetkisi yok.
--     TEK İSTİSNA: klinik_yedek yalnız SELECT (pg_dump kimlik tablolarını da — parola hash'leri dahil — yedeklemek zorunda; yedek şifreli). Yazma yetkisi kural 6'da denetlenir.
--  2) kimlik_rolu başka hiçbir public tabloda yetkiye sahip değil.
--  3) PUBLIC (herkes) hiçbir tabloda/fonksiyonda yetkiye sahip değil.
--  4) klinik_uygulama: TRUNCATE/REFERENCES/TRIGGER yetkisi yok.
--  5) klinik_anonim: yalnız INSERT (ve gerekli SELECT politikası olanlar) — izinli tablo listesi dışında yetki yok.
--  6) klinik_yedek: yalnız SELECT (yazma yetkisi yok); bakim_rolu: yalnız izinli (klinik SELECT, resmi_tatil yazma).
--  9) klinik_migrasyon: kendi başına HİÇ tablo yetkisi yok; tek üyeliği klinik_sahip (INHERIT yok, yalnız SET); migrasyon şemasına hiçbir uygulama rolü erişemez.
\set ON_ERROR_STOP 1
CREATE TEMP TABLE yetki_hata (kural text, ayrinti text);

-- 1) kimlik tabloları
INSERT INTO yetki_hata
SELECT 'kimlik_tablosu_baska_rol', r.rolname || ' -> ' || t.t || ' (' || p.p || ')'
FROM (VALUES ('klinik_uygulama'), ('klinik_anonim'), ('bakim_rolu'), ('klinik_tanima'), ('klinik_migrasyon')) r(rolname)
CROSS JOIN (VALUES ('kimlik_kullanici'), ('oturum'), ('kimlik_hesap'), ('kimlik_dogrulama')) t(t)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE has_table_privilege(r.rolname, 'public.' || t.t, p.p)
   OR (p.p IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') AND has_any_column_privilege(r.rolname, 'public.' || t.t, p.p));

-- 2) kimlik_rolu yalnız kimlik tablolarında
INSERT INTO yetki_hata
SELECT 'kimlik_rolu_fazla_yetki', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
  AND c.relname NOT IN ('kimlik_kullanici', 'oturum', 'kimlik_hesap', 'kimlik_dogrulama')
  AND has_table_privilege('kimlik_rolu', c.oid, p.p);
INSERT INTO yetki_hata
SELECT 'kimlik_rolu_fonksiyon', p.proname FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'telefon_normalize' AND has_function_privilege('kimlik_rolu', p.oid, 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

-- 3) PUBLIC
INSERT INTO yetki_hata
SELECT 'public_tablo_yetkisi', c.relname FROM pg_class c, aclexplode(c.relacl) a
WHERE c.relnamespace = 'public'::regnamespace AND a.grantee = 0;
INSERT INTO yetki_hata
SELECT 'public_fonksiyon_yetkisi', p.proname FROM pg_proc p, aclexplode(p.proacl) a
WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

-- 4) klinik_uygulama tehlikeli yetkiler
INSERT INTO yetki_hata
SELECT 'uygulama_tehlikeli_yetki', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND has_table_privilege('klinik_uygulama', c.oid, p.p);

-- 5) klinik_anonim izinli tablolar (self-servis kayıt/anket/başvuru) ve yalnız INSERT
INSERT INTO yetki_hata
SELECT 'anonim_izinsiz_yetki', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND has_table_privilege('klinik_anonim', c.oid, p.p)
  AND NOT (c.relname IN ('hasta', 'hasta_hassas', 'anket_yaniti', 'is_basvurusu', 'seans_degerlendirme') AND p.p IN ('INSERT', 'SELECT', 'UPDATE'));

-- 6) klinik_yedek yazamaz; bakim_rolu sınırlı
INSERT INTO yetki_hata
SELECT 'yedek_yazma_yetkisi', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND has_table_privilege('klinik_yedek', c.oid, p.p);
INSERT INTO yetki_hata
SELECT 'yedek_rol_uyeligi', m.roleid::regrole::text FROM pg_auth_members m
WHERE m.member = 'klinik_yedek'::regrole AND m.roleid::regrole::text <> 'pg_read_all_data';
INSERT INTO yetki_hata
SELECT 'bakim_fazla_yetki', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND has_table_privilege('bakim_rolu', c.oid, p.p)
  AND NOT (c.relname = 'klinik' AND p.p = 'SELECT') AND NOT (c.relname = 'resmi_tatil' AND p.p IN ('SELECT', 'INSERT', 'UPDATE'));
-- bakim_rolu klinik'te yalnız (id, ad) kolonlarını görebilmeli (tablo düzeyinde SELECT yok)
INSERT INTO yetki_hata SELECT 'bakim_klinik_tablo_select', 'klinik' WHERE has_table_privilege('bakim_rolu', 'public.klinik', 'SELECT');

-- 7) klinik_tanima: tablo düzeyinde yetki yok; kolon yetkisi yalnız klinik(id, ad, qr_kisa_kod) ve randevu(id, klinik_id)
INSERT INTO yetki_hata
SELECT 'tanima_fazla_yetki', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND has_table_privilege('klinik_tanima', c.oid, p.p);
INSERT INTO yetki_hata
SELECT 'tanima_fazla_kolon', c.relname || '.' || a.attname
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
  AND has_column_privilege('klinik_tanima', c.oid, a.attnum, 'SELECT')
  AND (c.relname, a.attname) NOT IN (('klinik', 'id'), ('klinik', 'ad'), ('klinik', 'qr_kisa_kod'), ('randevu', 'id'), ('randevu', 'klinik_id'));

-- 8) kullanici_tenant (tenant türetme eşlemesi): HİÇBİR uygulama rolünün yetkisi olmamalı (yalnız sahibi ve DEFINER tetikleyici/fonksiyonlar; klinik_yedek yalnız okur)
INSERT INTO yetki_hata
SELECT 'kullanici_tenant_yetkisi', r.rolname || ' (' || p.p || ')'
FROM (VALUES ('klinik_uygulama'), ('klinik_anonim'), ('bakim_rolu'), ('kimlik_rolu'), ('klinik_tanima')) r(rolname)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE has_table_privilege(r.rolname, 'public.kullanici_tenant', p.p) OR (p.p IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') AND has_any_column_privilege(r.rolname, 'public.kullanici_tenant', p.p));
INSERT INTO yetki_hata
SELECT 'kullanici_tenant_rls_var', 'kullanici_tenant' FROM pg_class WHERE relname = 'kullanici_tenant' AND relrowsecurity;  -- RLS olmamalı: özyineleme çözümünün dayanağı

-- 9) klinik_migrasyon (migration uygulayıcı): yetkisi yalnız klinik_sahip'e SET ROLE; doğrudan hiçbir tablo/fonksiyon yetkisi yok
INSERT INTO yetki_hata
SELECT 'migrasyon_dogrudan_tablo_yetkisi', c.relname || ' (' || p.p || ')'
FROM pg_class c CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(p)
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND has_table_privilege('klinik_migrasyon', c.oid, p.p);
INSERT INTO yetki_hata
SELECT 'migrasyon_dogrudan_fonksiyon_yetkisi', p.proname FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('klinik_migrasyon', p.oid, 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
INSERT INTO yetki_hata
SELECT 'migrasyon_rol_uyeligi', m.roleid::regrole::text || ' (inherit=' || m.inherit_option || ', set=' || m.set_option || ')' FROM pg_auth_members m
WHERE m.member = 'klinik_migrasyon'::regrole AND NOT (m.roleid = 'klinik_sahip'::regrole AND NOT m.inherit_option AND m.set_option);
INSERT INTO yetki_hata
SELECT 'migrasyon_ayricalikli_rol', rolname FROM pg_roles
WHERE rolname = 'klinik_migrasyon' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication);
INSERT INTO yetki_hata
SELECT 'migrasyon_sahip_nesne', c.relname FROM pg_class c WHERE c.relowner = 'klinik_migrasyon'::regrole;

-- 9b) migrasyon şeması (uygulanmış migration kaydı): var, sahibi klinik_sahip, hiçbir uygulama rolü göremez/okuyamaz
INSERT INTO yetki_hata
SELECT 'migrasyon_sema_yok', 'migrasyon.kayit (db/kurulum/03_migrasyon_kaydi.sql çalışmamış)' WHERE to_regclass('migrasyon.kayit') IS NULL;
INSERT INTO yetki_hata
SELECT 'migrasyon_kayit_sahibi', pg_get_userbyid(c.relowner) FROM pg_class c WHERE c.oid = to_regclass('migrasyon.kayit') AND pg_get_userbyid(c.relowner) <> 'klinik_sahip';
INSERT INTO yetki_hata
SELECT 'migrasyon_sema_erisimi', r.rolname || ' (' || p.p || ')'
FROM (VALUES ('klinik_uygulama'), ('klinik_anonim'), ('bakim_rolu'), ('kimlik_rolu'), ('klinik_tanima'), ('klinik_migrasyon')) r(rolname)
CROSS JOIN (VALUES ('USAGE'), ('CREATE')) p(p)
WHERE to_regnamespace('migrasyon') IS NOT NULL AND has_schema_privilege(r.rolname, 'migrasyon', p.p);
INSERT INTO yetki_hata
SELECT 'migrasyon_kayit_tablo_erisimi', r.rolname || ' (' || p.p || ')'
FROM (VALUES ('klinik_uygulama'), ('klinik_anonim'), ('bakim_rolu'), ('kimlik_rolu'), ('klinik_tanima'), ('klinik_migrasyon')) r(rolname)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(p)
WHERE to_regclass('migrasyon.kayit') IS NOT NULL AND has_table_privilege(r.rolname, 'migrasyon.kayit', p.p);
INSERT INTO yetki_hata
SELECT 'migrasyon_kayit_public', 'migrasyon.kayit' FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = to_regclass('migrasyon.kayit') AND a.grantee = 0;

-- Matris (bilgi): rol x tablo -> yetkiler
SELECT r.rolname AS rol, c.relname AS tablo,
       concat_ws(',', CASE WHEN has_table_privilege(r.rolname, c.oid, 'SELECT') THEN 'S' END,
                      CASE WHEN has_table_privilege(r.rolname, c.oid, 'INSERT') THEN 'I' END,
                      CASE WHEN has_table_privilege(r.rolname, c.oid, 'UPDATE') THEN 'U' END,
                      CASE WHEN has_table_privilege(r.rolname, c.oid, 'DELETE') THEN 'D' END) AS yetki
FROM (VALUES ('klinik_uygulama'), ('klinik_anonim'), ('bakim_rolu'), ('kimlik_rolu'), ('klinik_yedek'), ('klinik_tanima')) r(rolname)
CROSS JOIN pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm') AND NOT c.relispartition
  AND (has_table_privilege(r.rolname, c.oid, 'SELECT') OR has_table_privilege(r.rolname, c.oid, 'INSERT')
    OR has_table_privilege(r.rolname, c.oid, 'UPDATE') OR has_table_privilege(r.rolname, c.oid, 'DELETE'))
ORDER BY 1, 2;

SELECT kural, ayrinti FROM yetki_hata ORDER BY 1, 2;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM yetki_hata;
  IF n > 0 THEN RAISE EXCEPTION 'yetki-matrisi: % ihlal (yukarıdaki listeye bak)', n; END IF;
  RAISE NOTICE 'yetki-matrisi: temiz';
END $$;
