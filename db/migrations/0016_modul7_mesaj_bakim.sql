-- 0016 (elle yazıldı): Modül 7 — bildirim bağlantıları (tek kullanımlık, süreli), muhasebe adına izin bildirimi için dar DEFINER fonksiyon,
-- bakım betikleri için "sistem bağlamı" politikaları.
--
-- 1) bildirim_baglanti: e-posta/SMS/WhatsApp mesajlarında kişisel/sağlık verisi YOKTUR; yalnız klinik adı ve bu tabloda hash'i tutulan, tek kullanımlık,
--    süreli (72 sa) bir bağlantı gider. Bağlantı yalnız giriş sayfasına yönlendirir (oturum AÇMAZ). Token'ın kendisi saklanmaz (sha256).
-- 2) izin_talebi_yoneticiye_bildir(): muhasebe/resepsiyon/terapist adına açılan izin talebi bildirimini YALNIZ klinik_admin alıcılarına kuyruğa yazar
--    (mesaj_kuyrugu INSERT politikası bu rolleri kapsamadığı için eskiden sessizce atlanıyordu). İzin_bildirim_alicilari (0014) kaldırıldı: iletişim bilgisi
--    artık istemciye dönmez.
-- 3) Sistem bağlamı (session_user = bakim_rolu; sistem_baglami()): bakım betikleri klinik başına `SET LOCAL ROLE klinik_uygulama` + app.tenant_id ile çalışır
--    ve kullanıcı kimliği YOKTUR; bu yüzden rol tabanlı politikalar onları görmez. Aşağıdaki politikalar YALNIZ sistem_baglami() için açılır
--    (web uygulaması klinik_uygulama olarak bağlanır → sistem_baglami() false). zorunlu_tenant_siniri (0015) bunları tek bir kliniğe daraltır.
SET search_path = public, extensions;

-- ---------------------------------------------------------------- 1) bildirim_baglanti
CREATE TABLE bildirim_baglanti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  alici_tipi text NOT NULL CHECK (alici_tipi IN ('personel', 'hasta')),
  tetikleyici_kodu text,
  -- Hasta bağlantısında portal giriş adresi için kliniğin QR kısa kodu (oluşturulurken kopyalanır; klinik kimliği/adı bu tabloda tutulmaz).
  klinik_kisa_kod text CHECK (klinik_kisa_kod IS NULL OR klinik_kisa_kod ~ '^[A-Za-z0-9_-]{1,32}$'),
  son_kullanma timestamptz NOT NULL,
  kullanildi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bildirim_baglanti_hash_bicimi CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idx_bildirim_baglanti_klinik ON bildirim_baglanti (klinik_id, son_kullanma);
ALTER TABLE bildirim_baglanti ENABLE ROW LEVEL SECURITY;
ALTER TABLE bildirim_baglanti FORCE ROW LEVEL SECURITY;
-- Yazma: yalnız personel (portal hastası bağlantı üretemez), kendi kliniği için. Okuma politikası YOK (uygulama bağlantı satırını geri okumaz).
CREATE POLICY bildirim_baglanti_insert ON bildirim_baglanti AS PERMISSIVE FOR INSERT TO klinik_uygulama
  WITH CHECK (klinik_id = (SELECT current_klinik_id()) AND ((SELECT current_rol()) IS NOT NULL OR sistem_baglami()));
-- Temizlik (bakım betiği): 1 günden eski süresi dolmuş satırlar.
CREATE POLICY bildirim_baglanti_temizle ON bildirim_baglanti AS PERMISSIVE FOR DELETE TO klinik_uygulama
  USING (sistem_baglami() AND klinik_id = (SELECT current_klinik_id()) AND son_kullanma < now() - interval '1 day');
-- Sahip (DEFINER bildirim_baglantisi_kullan): token anonim akışta tenant'sız aranır → sahip politikası tenant'a bağlı DEĞİL; fonksiyon yalnız hash ile arar.
CREATE POLICY sahip_bildirim_baglanti ON bildirim_baglanti AS PERMISSIVE FOR ALL TO klinik_sahip USING (true) WITH CHECK (true);
-- Web uygulaması için tenant sınırı (klinik_sahip bu tablo için BİLİNÇLİ olarak kapsam dışı; bypassrls-kontrol.sql istisnası).
CREATE POLICY zorunlu_tenant_siniri ON bildirim_baglanti AS RESTRICTIVE FOR ALL TO klinik_uygulama
  USING (klinik_id = (SELECT current_klinik_id())) WITH CHECK (klinik_id = (SELECT current_klinik_id()));
-- DELETE ... WHERE son_kullanma < ... yalnız o kolonun SELECT yetkisini ve (WHERE için) bir SELECT politikasını ister; ikisi de yalnız sistem bağlamına açıktır.
-- Uygulamadaki personel/hasta oturumları bağlantı satırlarını (token_hash dahil) OKUYAMAZ.
CREATE POLICY bildirim_baglanti_temizle_sec ON bildirim_baglanti AS PERMISSIVE FOR SELECT TO klinik_uygulama
  USING (sistem_baglami() AND klinik_id = (SELECT current_klinik_id()));
GRANT SELECT (son_kullanma), INSERT, DELETE ON bildirim_baglanti TO klinik_uygulama;

CREATE FUNCTION bildirim_baglantisi_kullan(p_token_hash text) RETURNS TABLE (alici_tipi text, klinik_kisa_kod text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE v_tip text; v_kod text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
  UPDATE bildirim_baglanti b SET kullanildi = now()
   WHERE b.token_hash = p_token_hash AND b.kullanildi IS NULL AND b.son_kullanma > now()
  RETURNING b.alici_tipi, b.klinik_kisa_kod INTO v_tip, v_kod;
  IF v_tip IS NULL THEN RETURN; END IF;           -- geçersiz / kullanılmış / süresi dolmuş: ayrım sızdırılmaz
  alici_tipi := v_tip;
  -- Kısa kod yalnız hasta bağlantısında döner (portal giriş adresi için); klinik kimliği/adı DÖNMEZ.
  klinik_kisa_kod := CASE WHEN v_tip = 'hasta' THEN v_kod END;
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION bildirim_baglantisi_kullan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bildirim_baglantisi_kullan(text) TO klinik_uygulama;

-- ---------------------------------------------------------------- 2) izin bildirimi (dar DEFINER)
DROP FUNCTION IF EXISTS izin_bildirim_alicilari(text[]);

CREATE FUNCTION izin_talebi_yoneticiye_bildir(p_talep_id uuid, p_taban text, p_planlanan timestamptz DEFAULT NULL) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_klinik uuid := current_klinik_id();
  v_rol kullanici_rol_tipi := current_rol();
  v_talep personel_izin_talebi%ROWTYPE;
  v_kural mesaj_kurallari%ROWTYPE;
  v_klinik_ad text;
  v_token text;
  v_adet integer := 0;
  v_satir integer;
  r record;
  k record;
BEGIN
  IF v_klinik IS NULL OR v_rol IS NULL OR v_rol NOT IN ('klinik_admin', 'resepsiyon', 'terapist', 'muhasebe') THEN RAISE EXCEPTION 'yetkisiz'; END IF;
  -- Bağlantı tabanı çağırandan yalnız ORİJİN olarak gelir (yol/sorgu/kimlik bilgisi içeremez); token'ı fonksiyonun kendisi üretir.
  IF p_taban IS NULL OR p_taban !~ '^https?://[A-Za-z0-9.-]{1,200}(:[0-9]{1,5})?$' THEN RAISE EXCEPTION 'baglanti_gecersiz'; END IF;

  SELECT * INTO v_talep FROM personel_izin_talebi WHERE id = p_talep_id AND klinik_id = v_klinik;
  IF NOT FOUND THEN RAISE EXCEPTION 'talep_bulunamadi'; END IF;
  -- Çağıran ya talebin sahibi personel ya da (adına açan) klinik_admin/muhasebe olmalı; talep yeni ve beklemede olmalı (bu fonksiyon genel bir mesaj kanalı DEĞİLDİR).
  IF NOT (v_rol IN ('klinik_admin', 'muhasebe') OR EXISTS (SELECT 1 FROM personel p WHERE p.id = v_talep.personel_id AND p.kullanici_id = app_kullanici_id())) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;
  IF v_talep.durum <> 'beklemede' OR v_talep.created_at < now() - interval '10 minutes' THEN RAISE EXCEPTION 'talep_bildirimi_gecersiz'; END IF;

  SELECT * INTO v_kural FROM mesaj_kurallari WHERE klinik_id = v_klinik AND tetikleyici_kodu = 'personel_izin_talebi_yeni' AND aktif;
  IF NOT FOUND THEN RETURN 0; END IF;                         -- kural pasif/yok: sessizce atla (mesajlaşma modülünün genel ilkesi)

  SELECT ad INTO v_klinik_ad FROM klinik WHERE id = v_klinik;

  -- ALICI ROLÜ klinik_admin'e KİLİTLİ: adres/telefon yalnız bu kliniğin aktif yöneticisinin kayıtlı bilgisidir; çağıran adres veremez.
  FOR r IN
    SELECT p.id AS personel_id, u.telefon, p.eposta
      FROM personel p JOIN kullanici u ON u.id = p.kullanici_id
     WHERE p.klinik_id = v_klinik AND p.aktif AND u.rol = 'klinik_admin' AND u.klinik_id = v_klinik
  LOOP
    FOR k IN
      SELECT 'sms'::mesaj_kanal_tipi AS kanal, r.telefon AS adres WHERE v_kural.sms_aktif AND r.telefon IS NOT NULL
      UNION ALL SELECT 'whatsapp'::mesaj_kanal_tipi, r.telefon WHERE v_kural.whatsapp_aktif AND r.telefon IS NOT NULL
      UNION ALL SELECT 'mail'::mesaj_kanal_tipi, r.eposta WHERE v_kural.mail_aktif AND r.eposta IS NOT NULL
    LOOP
      -- Her mesaj satırına AYRI tek kullanımlık bağlantı (token yalnız bu fonksiyonda ve mesaj metninde; tabloda yalnız sha256).
      v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
      INSERT INTO mesaj_kuyrugu (klinik_id, tetikleyici_kodu, kanal, alici_tipi, alici_id, alici_adres, gonderilecek_metin, idempotency_anahtari, planlanan_zaman)
      VALUES (v_klinik, 'personel_izin_talebi_yeni', k.kanal, 'personel', r.personel_id, k.adres,
              coalesce(v_klinik_ad, 'Klinik') || ' size bir bildirim gönderdi. Görüntülemek için: ' || p_taban || '/b/' || v_token,   -- sabit, veri içermeyen metin
              'izin_yeni:' || p_talep_id || ':' || r.personel_id || ':' || k.kanal, coalesce(p_planlanan, now()))
      ON CONFLICT (idempotency_anahtari) DO NOTHING;
      GET DIAGNOSTICS v_satir = ROW_COUNT;
      IF v_satir > 0 THEN
        INSERT INTO bildirim_baglanti (klinik_id, token_hash, alici_tipi, tetikleyici_kodu, son_kullanma)
        VALUES (v_klinik, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'personel', 'personel_izin_talebi_yeni', now() + interval '72 hours');
      END IF;
      v_adet := v_adet + v_satir;
    END LOOP;
  END LOOP;
  RETURN v_adet;
END
$$;
REVOKE ALL ON FUNCTION izin_talebi_yoneticiye_bildir(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION izin_talebi_yoneticiye_bildir(uuid, text, timestamptz) TO klinik_uygulama;

-- ---------------------------------------------------------------- 3) sistem bağlamı politikaları (bakım betikleri)
DO $$
DECLARE t text;
BEGIN
  -- Salt-okuma: kuyruk/kural/kredi/ayar + hatırlatma ve dönem kapatma için gereken tablolar
  FOREACH t IN ARRAY ARRAY['mesaj_kuyrugu', 'mesaj_kurallari', 'mesaj_kredileri', 'klinik_ayarlar', 'randevu', 'hasta', 'terapist', 'personel', 'personel_ucret',
                           'personel_puantaj', 'personel_puantaj_donem', 'personel_hesap_hareket', 'pozisyonlar', 'resmi_tatil_oneri']
  LOOP
    EXECUTE format('CREATE POLICY sistem_baglami_okuma ON %I AS PERMISSIVE FOR SELECT TO klinik_uygulama USING (sistem_baglami())', t);
  END LOOP;
END $$;
-- Yazma: yalnız kuyruk işçisi (durum/deneme güncellemeleri) ve hatırlatma/bildirim yazıcıları.
CREATE POLICY sistem_baglami_yazma ON mesaj_kuyrugu AS PERMISSIVE FOR UPDATE TO klinik_uygulama USING (sistem_baglami()) WITH CHECK (sistem_baglami());
CREATE POLICY sistem_baglami_ekleme ON mesaj_kuyrugu AS PERMISSIVE FOR INSERT TO klinik_uygulama WITH CHECK (sistem_baglami());
CREATE POLICY sistem_baglami_ekleme ON resmi_tatil_oneri AS PERMISSIVE FOR INSERT TO klinik_uygulama WITH CHECK (sistem_baglami());
GRANT SELECT, UPDATE ON mesaj_kuyrugu TO klinik_uygulama;
GRANT SELECT ON mesaj_kredileri TO klinik_uygulama;
