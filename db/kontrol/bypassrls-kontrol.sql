-- RLS'i atlayabilen ROL/FONKSİYON denetimi. Hatada (HATA satırı varsa) EXCEPTION fırlatır; psql -v ON_ERROR_STOP=1 ile kurulum durur.
-- İzinli istisnalar (başka hiçbiri): `postgres` (kurulum süper kullanıcısı; yalnız ilk kurulum/PG bakımı, uygulama ve betikler bağlanmaz) ve `klinik_yedek` (yalnız pg_dump).
-- klinik_migrasyon süper kullanıcı/BYPASSRLS DEĞİLDİR (6c).
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
WHERE n.nspname IN ('public', 'extensions', 'tanima') AND (r.rolbypassrls OR r.rolsuper)
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
  AND c.relname NOT IN ('kimlik_kullanici', 'kullanici_tenant')   -- kullanici_tenant: bilerek RLS'siz (özyineleme çözümü), yetki-matrisi.sql hiçbir uygulama rolüne yetki verilmediğini denetler; kimlik katmanı: RLS yerine ROL yetkisiyle korunur (yalnız kimlik_rolu erişir; yetki-matrisi.sql denetler)
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
WHERE r.rolname IN ('klinik_uygulama', 'bakim_rolu', 'klinik_anonim', 'kimlik_rolu', 'klinik_tanima') AND c.relnamespace = 'public'::regnamespace;

-- 6b) pg_hba kuralları: yalnız localhost + parola yöntemi. pg_hba_file_rules süper kullanıcıya (ya da GRANT edilene) açıktır; migration uygulayıcı
--     (klinik_migrasyon) okuyamaz → o durumda bu blok atlanır ve BILGI satırı yazılır (kurulum.ps1 aynı doğrulamayı dosyadan ayrıca yapar).
DO $$
BEGIN
  IF has_table_privilege(current_user, 'pg_catalog.pg_hba_file_rules', 'SELECT') THEN
    INSERT INTO kontrol_sonuc
    SELECT 'hba_uzak_adres', 'HATA', 'satır ' || line_number || ': ' || coalesce(address, '(yerel soket)') || ' (' || array_to_string(user_name, ',') || ', ' || auth_method || ')'
    FROM pg_hba_file_rules
    WHERE type LIKE 'host%' AND auth_method <> 'reject' AND (address IS NULL OR address NOT IN ('127.0.0.1', '::1', 'localhost'));
    INSERT INTO kontrol_sonuc
    SELECT 'hba_zayif_yontem', 'UYARI', 'satır ' || line_number || ': ' || auth_method || ' (üretimde scram-sha-256 olmalı)'
    FROM pg_hba_file_rules
    WHERE type LIKE 'host%' AND auth_method NOT IN ('scram-sha-256', 'reject');
  ELSE
    INSERT INTO kontrol_sonuc VALUES ('hba_kontrolu', 'BILGI', 'pg_hba_file_rules okunamadı (yetki yok): kurulum.ps1 dosya doğrulamasına bakın');
  END IF;
END $$;
INSERT INTO kontrol_sonuc
SELECT 'yedek_super_veya_yazma', 'HATA', rolname FROM pg_roles WHERE rolname = 'klinik_yedek' AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication);
INSERT INTO kontrol_sonuc
SELECT 'yedek_sahip_nesne', 'HATA', c.relname FROM pg_class c WHERE c.relowner = 'klinik_yedek'::regrole;

-- 6c) klinik_migrasyon: süper kullanıcı/BYPASSRLS/rol-DB oluşturma/replikasyon YOK; yalnız klinik_sahip üyeliği (yetki-matrisi.sql üyeliği ayrıca denetler)
INSERT INTO kontrol_sonuc
SELECT 'migrasyon_ayricalikli', 'HATA', rolname FROM pg_roles
WHERE rolname = 'klinik_migrasyon' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication);

-- 6d) Zorunlu tenant sınırı (0015): klinik_id kolonlu her RLS'li tabloda RESTRICTIVE `zorunlu_tenant_siniri` politikası (klinik_uygulama + klinik_sahip=DEFINER rolü) BULUNMALI.
--     Eksikse super_admin'in "OR is_super_admin()" dalları (destek bağlamı) başka kliniğin verisini sızdırabilir. Yeni klinik_id'li tablo eklerken
--     0015'teki DO bloğu desenini uygulayın. İstisna: destek_baglami (yalnız sahip politikası; hiçbir uygulama rolüne yetki yok).
INSERT INTO kontrol_sonuc
SELECT 'zorunlu_tenant_siniri_yok', 'HATA', c.relname
FROM pg_class c
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'klinik_id' AND NOT a.attisdropped
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND c.relrowsecurity
  AND c.relname NOT IN ('destek_baglami', 'bildirim_baglanti')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p
     WHERE p.polrelid = c.oid AND p.polname = 'zorunlu_tenant_siniri' AND NOT p.polpermissive
       AND p.polroles @> ARRAY['klinik_uygulama'::regrole::oid, 'klinik_sahip'::regrole::oid]
  );

-- 6e) bildirim_baglanti (0016): token anonim akışta tenant'sız aranır → klinik_sahip için BİLİNÇLİ istisna; web uygulaması (klinik_uygulama) için RESTRICTIVE sınır ZORUNLU.
INSERT INTO kontrol_sonuc
SELECT 'bildirim_baglanti_tenant_siniri_yok', 'HATA', 'bildirim_baglanti'
WHERE to_regclass('bildirim_baglanti') IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM pg_policy p WHERE p.polrelid = 'bildirim_baglanti'::regclass AND p.polname = 'zorunlu_tenant_siniri' AND NOT p.polpermissive
    AND p.polroles @> ARRAY['klinik_uygulama'::regrole::oid]);

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
