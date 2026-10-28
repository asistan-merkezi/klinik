-- Portal ve QR denetimi (2026-10-12).
--
-- 1) hasta_update_portal politikası hastanın kendi satırındaki HER kolonu güncellemesine izin
--    veriyordu (kolon kısıtlayan tetikleyici yalnız terapist rolüne bakıyor). Portal oturumundaki
--    bir hasta PostgREST'e doğrudan istekle kendi kategorisini (vita→prime: daha yüksek iskonto),
--    risk bayraklarını, telefonunu (giriş eşlemesi), kayıt kanalını, hatta klinik_id'sini
--    değiştirebiliyordu. Artık portal oturumu yalnız portal formunun yazdığı alanları değiştirebilir.
-- 2) hasta_hassas.klinik_id yalnız INSERT'te hastadan türetiliyordu; UPDATE'te istemci değeri
--    kabul ediliyordu (portal hastası kendi hassas satırını başka kliniğe taşıyabilirdi).
-- 3) Anonim formların serbest metin alanlarına DB'de de üst sınır (uygulamadaki zod sınırının
--    ikinci katmanı; NOT VALID — mevcut satırlar denetlenmez).

-- ---------------------------------------------------------------------------
-- 1) Portal oturumu: hasta tablosunda kolon izin listesi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hasta_portal_alan_kisitla()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_izinli text[] := ARRAY[
    'cinsiyet', 'eposta', 'referans_kanali',
    'ticari_ileti_onay_tarihi', 'ticari_ileti_onaylayan_tip', 'ticari_ileti_onaylayan_kullanici_id',
    'ozel_nitelikli_veri_onay_tarihi', 'ozel_nitelikli_onaylayan_tip', 'ozel_nitelikli_onaylayan_kullanici_id',
    'son_guncelleyen_tip', 'son_guncelleyen_kullanici_id', 'updated_at'
  ];
  v_eski jsonb := to_jsonb(OLD);
  v_yeni jsonb := to_jsonb(NEW);
  v_kolon text;
BEGIN
  -- Yalnız hasta portalı oturumu (personel rolü yok, hasta eşlemesi var). Personel, servis rolü
  -- ve oturumsuz bağlam etkilenmez.
  IF current_rol() IS NOT NULL OR current_hasta_id() IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_kolon IN SELECT jsonb_object_keys(v_yeni) LOOP
    IF v_yeni -> v_kolon IS DISTINCT FROM v_eski -> v_kolon AND NOT (v_kolon = ANY (v_izinli)) THEN
      RAISE EXCEPTION 'portal_alan_degistirilemez: %', v_kolon USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION hasta_portal_alan_kisitla() FROM PUBLIC, anon, authenticated;

-- Ada göre trg_hasta_denetim'den (son_guncelleyen_* atar) SONRA çalışır.
DROP TRIGGER IF EXISTS trg_zz_hasta_portal_alan_kisitla ON hasta;
CREATE TRIGGER trg_zz_hasta_portal_alan_kisitla
  BEFORE UPDATE ON hasta
  FOR EACH ROW EXECUTE FUNCTION hasta_portal_alan_kisitla();

-- ---------------------------------------------------------------------------
-- 2) hasta_hassas.klinik_id her yazımda hastadan türetilir
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hasta_hassas_klinik_id ON hasta_hassas;
CREATE TRIGGER trg_hasta_hassas_klinik_id
  BEFORE INSERT OR UPDATE OF klinik_id, hasta_id ON hasta_hassas
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_klinik_id_ata();

-- ---------------------------------------------------------------------------
-- 3) Anonim form metinlerine üst sınır
-- ---------------------------------------------------------------------------
ALTER TABLE anket_yaniti DROP CONSTRAINT IF EXISTS anket_yaniti_metin_uzunluk;
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_metin_uzunluk CHECK (
  coalesce(length(oneri_metni), 0) <= 2000
  AND coalesce(length(ad_soyad), 0) <= 120
  AND coalesce(length(telefon), 0) <= 20
) NOT VALID;

ALTER TABLE seans_degerlendirme DROP CONSTRAINT IF EXISTS seans_degerlendirme_metin_uzunluk;
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_metin_uzunluk CHECK (
  coalesce(length(oneri_metni), 0) <= 2000
) NOT VALID;

-- ---------------------------------------------------------------------------
-- 4) mesaj_kuyrugu: işleme alınma zamanı (takılı kalan satırların kurtarılması)
--    Satır 'gonderiliyor'a alındıktan sonra işlem çökerse/zaman aşımına uğrarsa satır o durumda
--    sonsuza kadar kalıyordu. Cron, 10 dakikadan eski 'gonderiliyor' satırlarını tekrar
--    'beklemede'ye alır (merkezdeki idempotency anahtarı mükerrer gönderimi engeller).
-- ---------------------------------------------------------------------------
ALTER TABLE mesaj_kuyrugu ADD COLUMN IF NOT EXISTS isleme_alinma_zamani timestamptz;
