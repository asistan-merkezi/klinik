-- RLS'i atlayabilen ROL/FONKSİYON denetimi. Hatada (HATA satırı varsa) EXCEPTION fırlatır; psql -v ON_ERROR_STOP=1 ile kurulum durur.
-- İzinli istisnalar (başka hiçbiri): `postgres` (kurulum süper kullanıcısı; uygulama/betikler bağlanmaz) ve `klinik_yedek` (yalnız pg_dump).
-- bakim_rolu BYPASSRLS DEĞİLDİR; burada bulunursa HATA'dır.
\set ON_ERROR_STOP 1
CREATE TEMP TABLE kontrol_sonuc (kontrol text, durum text, ayrinti text);

-- 1) BYPASSRLS veya süper kullanıcı olan roller (izinli liste dışı)
INSERT INTO kontrol_sonuc
SELECT 'rol_bypassrls', 'HATA', rolname FROM pg_roles
WHERE (rolbypassrls OR rolsuper) AND rolname NOT IN ('postgres', 'klinik_yedek') AND rolname NOT LIKE 'pg\_%';

-- 2) Sahibi BYPASSRLS/süper kullanıcı olan fonksiyonlar (her fonksiyon klinik_sahip'in olmalı)
INSERT INTO kontrol_sonuc
SELECT 'fonksiyon_sahibi_bypass', 'HATA', n.nspname || '.' || p.proname || ' (sahip: ' || r.rolname || ')'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname IN ('public', 'extensions') AND (r.rolbypassrls OR r.rolsuper)
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');   -- eklenti fonksiyonları hariç

-- 3) public şemasında sahibi klinik_sahip olmayan fonksiyon (eklenti dışı)
INSERT INTO kontrol_sonuc
SELECT 'fonksiyon_sahibi_farkli', 'HATA', p.proname || ' (sahip: ' || r.rolname || ')'
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.pronamespace = 'public'::regnamespace AND r.rolname <> 'klinik_sahip'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

-- 4) Tenant tablosu (klinik_id var) RLS'siz veya FORCE'suz; istisna listesi: db/arac/sema-uret.mjs FORCE_ISTISNA
INSERT INTO kontrol_sonuc
SELECT 'tenant_tablo_force', 'HATA', c.relname || CASE WHEN NOT c.relrowsecurity THEN ' (RLS kapalı)' ELSE ' (FORCE yok)' END
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  AND (c.relname = 'klinik' OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'klinik_id' AND NOT a.attisdropped))
  AND NOT (c.relrowsecurity AND c.relforcerowsecurity);

-- 5) bakim_rolu: kendi (doğrudan) tablo yetkisi yalnız klinik üzerinde olmalı
INSERT INTO kontrol_sonuc
SELECT 'bakim_rolu_fazla_yetki', 'HATA', table_name || ':' || privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'bakim_rolu' AND table_schema = 'public'
  AND NOT (table_name = 'klinik' AND privilege_type = 'SELECT')
  AND NOT (table_name = 'resmi_tatil' AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE'));

-- 6) Uygulama rolü hiçbir nesnenin sahibi olmamalı
INSERT INTO kontrol_sonuc
SELECT 'uygulama_sahip', 'HATA', c.relname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
WHERE r.rolname IN ('klinik_uygulama', 'bakim_rolu', 'klinik_anonim');

-- 7) Bilgi: izinli istisnalar
INSERT INTO kontrol_sonuc
SELECT 'izinli_istisna', 'BILGI', rolname || CASE WHEN rolsuper THEN ' (süper kullanıcı)' ELSE ' (BYPASSRLS)' END
FROM pg_roles WHERE (rolbypassrls OR rolsuper) AND rolname IN ('postgres', 'klinik_yedek');

SELECT kontrol, durum, ayrinti FROM kontrol_sonuc ORDER BY durum DESC, kontrol, ayrinti;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM kontrol_sonuc WHERE durum = 'HATA';
  IF n > 0 THEN RAISE EXCEPTION 'bypassrls-kontrol: % HATA bulundu (yukarıdaki listeye bak)', n; END IF;
  RAISE NOTICE 'bypassrls-kontrol: temiz (BYPASSRLS/süper kullanıcı yalnız izinli istisnalar)';
END $$;
