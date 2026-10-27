-- 0004 (elle yazıldı): (1) giriş öncesi TENANT'SIZ çözümleme için dar `tanima` şeması, (2) bağlamsız çağrıda "güvenli açık" davranan DEFINER'ların kapatılması.
-- Çalıştıran: klinik_sahip (süper kullanıcı oturumundan SET ROLE ile; klinik_tanima'ya SET üyeliği 00_roller.sql'de verildi).
SET search_path = public, extensions;

-- 1) tanima: FORCE RLS altında klinik_sahip yalnız aktif tenant'ı görür; "kısa kod hangi klinik?" sorusunun tenant'ı henüz yok.
--    Çözüm: sahibi klinik_tanima olan iki tek amaçlı fonksiyon. klinik_tanima yalnız şu kolonları okuyabilir (BYPASSRLS DEĞİL, politika USING(true) yalnız bu kolon yetkisiyle sınırlı).
GRANT SELECT (id, ad, qr_kisa_kod) ON klinik TO klinik_tanima;
GRANT SELECT (id, klinik_id) ON randevu TO klinik_tanima;
CREATE POLICY tanima_klinik ON klinik AS PERMISSIVE FOR SELECT TO klinik_tanima USING (true);
CREATE POLICY tanima_randevu ON randevu AS PERMISSIVE FOR SELECT TO klinik_tanima USING (true);

CREATE SCHEMA tanima AUTHORIZATION klinik_tanima;   -- şemayı sahip açar (klinik_tanima'nın veritabanında CREATE yetkisi yok)
SET ROLE klinik_tanima;
-- QR kısa kodundan klinik (id, ad). Sonuç tenant bağlamını KURMAK içindir: uygulama dönen id'yi app.tenant_id olarak verip sonraki adımları tenant içinde yapar.
CREATE FUNCTION tanima.klinik_qr_bilgisi_getir(p_kisa_kod text) RETURNS TABLE (id uuid, ad text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT k.id, k.ad FROM klinik k WHERE k.qr_kisa_kod = p_kisa_kod $$;
-- Anket bağlantısındaki randevu kimliğinden klinik kimliği (anket sayfası yalnız randevu id'sini bilir).
CREATE FUNCTION tanima.randevu_klinik_cozumle(p_randevu_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT r.klinik_id FROM randevu r WHERE r.id = p_randevu_id $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tanima FROM PUBLIC;
GRANT USAGE ON SCHEMA tanima TO klinik_anonim, klinik_uygulama;
GRANT EXECUTE ON FUNCTION tanima.klinik_qr_bilgisi_getir(text), tanima.randevu_klinik_cozumle(uuid) TO klinik_anonim, klinik_uygulama;
RESET ROLE;
SET ROLE klinik_sahip;

-- 2) qr_kodu_aktif_mi: bağlamsız/yanlış tenant'ta "kayıt yok -> açık" varsayılanı QR'ı yanlışlıkla AÇIK gösterirdi (FORCE altında satır görünmez).
--    Artık çağıran tenant bağlamı p_klinik_id ile eşleşmiyorsa FALSE (güvenli kapalı).
CREATE OR REPLACE FUNCTION qr_kodu_aktif_mi(p_klinik_id uuid, p_tip text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT CASE
    WHEN current_klinik_id() IS DISTINCT FROM p_klinik_id THEN false
    ELSE COALESCE((SELECT (ayarlar -> 'qr_kodlari' -> p_tip ->> 'aktif')::boolean FROM klinik_ayarlar WHERE klinik_id = p_klinik_id), true)
  END
$$;

-- 3) personel_puantaj_donemi_acik_mi: "kapalı dönem yok -> açık" sonucu bağlam yokken/yanlış tenant'ta TRUE dönerek dönem kilidini atlatırdı.
--    Artık personel çağıranın tenant'ında değilse (veya bağlam yoksa) FALSE (= "açık değil", kayıt yapılamaz).
CREATE OR REPLACE FUNCTION personel_puantaj_donemi_acik_mi(p_personel_id uuid, p_tarih date) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT (current_klinik_id() IS NOT NULL OR is_super_admin() OR sistem_baglami())
     AND EXISTS (SELECT 1 FROM personel p WHERE p.id = p_personel_id AND (p.klinik_id = current_klinik_id() OR is_super_admin()))
     AND NOT EXISTS (
       SELECT 1 FROM personel_puantaj_donem d
       WHERE d.personel_id = p_personel_id
         AND (d.klinik_id = current_klinik_id() OR is_super_admin())
         AND d.yil = EXTRACT(YEAR FROM p_tarih)::int
         AND d.ay = EXTRACT(MONTH FROM p_tarih)::int
         AND d.durum = 'kapali'
     )
$$;
