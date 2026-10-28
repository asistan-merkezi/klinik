-- 0012 (elle yazıldı): mali yazma işlemleri için IDEMPOTENCY anahtarı (Modül 4, kural 4).
-- Çift tıklama / ağ yeniden denemesi aynı isteği iki kez gönderirse ikinci yazım yapılmaz. Form açılışında istemci rastgele bir uuid üretir
-- ve istekle gönderir; sunucu, ledger yazımıyla AYNI transaction içinde (klinik_id, anahtar) satırını ekler. Satır zaten varsa işlem atlanır.
-- Tablo yalnız bu amaç içindir: UPDATE yetkisi yok; 2 günden eski anahtarlar klinik başına temizlenebilir (aşağıdaki DELETE politikası; Modül 7 bakım betiği
-- her klinik için withTenant ile siler). bakim_rolu'na bu tabloda HİÇBİR yetki verilmez (bakim_rolu politikası: yalnız klinik SELECT + bakım fonksiyonları).
SET search_path = public, extensions;

CREATE TABLE islem_anahtari (
  klinik_id   uuid        NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  anahtar     uuid        NOT NULL,
  islem       text        NOT NULL,
  kullanici_id uuid,
  olusturma   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (klinik_id, anahtar)
);
CREATE INDEX idx_islem_anahtari_olusturma ON islem_anahtari (olusturma);

ALTER TABLE islem_anahtari ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_anahtari FORCE ROW LEVEL SECURITY;

CREATE POLICY islem_anahtari_select ON islem_anahtari AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (klinik_id = (SELECT current_klinik_id()));
CREATE POLICY islem_anahtari_insert ON islem_anahtari AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (klinik_id = (SELECT current_klinik_id()));

CREATE POLICY islem_anahtari_delete_eski ON islem_anahtari AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (klinik_id = (SELECT current_klinik_id()) AND olusturma < now() - interval '2 days');

GRANT SELECT, INSERT, DELETE ON islem_anahtari TO klinik_uygulama;

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- Modül 4 sertleştirmeleri (kural 4/6): tutar/iskonto CHECK'leri + islem_tanimi_kaydet içinde tenant doğrulaması.
-- ---------------------------------------------------------------------------------------------------------------------------------------------

-- 1) Hasta cari defterinde negatif/sıfır tutar ve tutarı aşan iskonto DB düzeyinde de reddedilir (uygulama + RPC'lerin yanında son savunma).
--    NOT VALID: yalnız YENİ ve değiştirilen satırlara uygulanır (arşivden aktarılan eski veri bozulmasın); veri taşıma sonrası VALIDATE edilir.
--    'borc' satırında tutar 0 olabilir (ücretsiz seans); odeme/iade/kredi her zaman pozitif.
ALTER TABLE hasta_bakiye_hareket
  ADD CONSTRAINT hasta_bakiye_hareket_tutar_negatif_degil CHECK (tutar >= 0) NOT VALID,
  ADD CONSTRAINT hasta_bakiye_hareket_tutar_pozitif CHECK (tur = 'borc' OR tutar > 0) NOT VALID,
  ADD CONSTRAINT hasta_bakiye_hareket_iskonto_aralik CHECK (iskonto_tutari >= 0 AND iskonto_tutari <= tutar) NOT VALID;

-- 2) islem_tanimi_kaydet: adımlardaki cihaz / pozisyon kimlikleri ÇAĞIRANIN kliniğine ait olmalı (FK tenant'ı doğrulamaz).
CREATE OR REPLACE FUNCTION public.islem_tanimi_kaydet(p_id uuid, p_ad text, p_vita_fiyat numeric, p_plus_fiyat numeric, p_elit_fiyat numeric, p_prime_fiyat numeric, p_kdv_orani numeric, p_muhasebe_hizmet_ismi text, p_adimlar jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_islem_id uuid;
  v_adim jsonb;
  v_sira integer := 0;
  v_gonderilen_id_listesi uuid[] := '{}';
  v_adim_id uuid;
  v_cihaz uuid;
  v_pozisyon uuid;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_adimlar IS NULL OR jsonb_array_length(p_adimlar) = 0 THEN
    RAISE EXCEPTION 'adim_gerekli';
  END IF;

  -- Tenant doğrulaması (önce tümü; hiçbir şey yazılmadan reddedilir)
  FOR v_adim IN SELECT * FROM jsonb_array_elements(p_adimlar)
  LOOP
    v_cihaz := NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid;
    v_pozisyon := NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid;
    IF v_cihaz IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cihaz WHERE id = v_cihaz AND klinik_id = v_klinik_id) THEN
      RAISE EXCEPTION 'cihaz_bulunamadi';
    END IF;
    IF v_pozisyon IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pozisyonlar WHERE id = v_pozisyon AND klinik_id = v_klinik_id) THEN
      RAISE EXCEPTION 'pozisyon_bulunamadi';
    END IF;
  END LOOP;

  IF p_id IS NULL THEN
    INSERT INTO islem_tanimi
      (klinik_id, ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi)
    VALUES
      (v_klinik_id, p_ad, p_vita_fiyat, p_plus_fiyat, p_elit_fiyat, p_prime_fiyat, p_kdv_orani, p_muhasebe_hizmet_ismi)
    RETURNING id INTO v_islem_id;
  ELSE
    UPDATE islem_tanimi SET
      ad = p_ad,
      vita_fiyat = p_vita_fiyat,
      plus_fiyat = p_plus_fiyat,
      elit_fiyat = p_elit_fiyat,
      prime_fiyat = p_prime_fiyat,
      kdv_orani = p_kdv_orani,
      muhasebe_hizmet_ismi = p_muhasebe_hizmet_ismi
    WHERE id = p_id AND klinik_id = v_klinik_id
    RETURNING id INTO v_islem_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tedavi_bulunamadi';
    END IF;
  END IF;

  FOR v_adim IN SELECT * FROM jsonb_array_elements(p_adimlar)
  LOOP
    v_sira := v_sira + 1;

    IF NULLIF(v_adim->>'id', '') IS NOT NULL THEN
      UPDATE islem_tanimi_adim SET
        ad = v_adim->>'ad',
        gerekli_cihaz_id = NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        uygulayici_pozisyon_id = NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        sure_dakika = NULLIF(v_adim->>'sure_dakika', '')::integer,
        sira = v_sira
      WHERE id = (v_adim->>'id')::uuid AND islem_tanimi_id = v_islem_id
      RETURNING id INTO v_adim_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'adim_bulunamadi';
      END IF;
    ELSE
      INSERT INTO islem_tanimi_adim (islem_tanimi_id, ad, gerekli_cihaz_id, uygulayici_pozisyon_id, sure_dakika, sira)
      VALUES (
        v_islem_id,
        v_adim->>'ad',
        NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        NULLIF(v_adim->>'sure_dakika', '')::integer,
        v_sira
      )
      RETURNING id INTO v_adim_id;
    END IF;

    v_gonderilen_id_listesi := v_gonderilen_id_listesi || v_adim_id;
  END LOOP;

  DELETE FROM islem_tanimi_adim
  WHERE islem_tanimi_id = v_islem_id AND NOT (id = ANY(v_gonderilen_id_listesi));

  RETURN v_islem_id;
END;
$function$;
