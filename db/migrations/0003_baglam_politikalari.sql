-- Bağlam çözümlemesi için dar "kendi satırı" politikaları (FORCE RLS altında current_rol()/current_hasta_id() özyinelemesiz çalışsın).
-- klinik_sahip yalnız ÇALIŞAN KULLANICININ KENDİ satırını görür; başka kullanıcı/klinik satırı görünmez.
CREATE POLICY sahip_kendi_satir ON kullanici AS PERMISSIVE FOR SELECT TO klinik_sahip USING (id = app_kullanici_id());
CREATE POLICY sahip_kendi_satir ON hasta_kullanici AS PERMISSIVE FOR SELECT TO klinik_sahip USING (id = app_kullanici_id());

-- bakim_rolu: yalnız klinik listesi (id, ad). RLS atlanmaz; bu açık politika yalnız bu iki kolonu listelemeye izin verir.
GRANT SELECT (id, ad) ON klinik TO bakim_rolu;
CREATE POLICY bakim_klinik_listesi ON klinik AS PERMISSIVE FOR SELECT TO bakim_rolu USING (true);
-- Global (tenant'sız) resmi tatil kataloğunu betik yazar.
GRANT SELECT, INSERT, UPDATE ON resmi_tatil TO bakim_rolu;
CREATE POLICY bakim_resmi_tatil ON resmi_tatil AS PERMISSIVE FOR ALL TO bakim_rolu USING (true) WITH CHECK (true);

-- Bağlam fonksiyonları (db/arac/baglam-fonksiyonlari.sql): politikalar bunları çağırır; 0002'deki REVOKE FROM PUBLIC sonrası açıkça verilir.
GRANT EXECUTE ON FUNCTION current_rol(), is_super_admin(), current_hasta_id() TO klinik_uygulama, klinik_anonim, bakim_rolu;
