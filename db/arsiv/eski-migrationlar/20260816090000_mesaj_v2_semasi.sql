-- Mesajlaşma modülü — FAZ 1 (şema + RLS + kod-tabanlı katalog geçişi).
-- Görev: "Klinik Asistanı — Mesajlaşma Modülünü Gerçekten Çalışır Hale Getir".
-- Bu migration SADECE veri katmanını değiştirir; panel UI'ı Faz 1 kapsamında
-- yeni şemaya bağlanır ama tasarımı değişmez (ayrı bir kod turunda).
--
-- Mimari değişiklik: tetikleyici KATALOĞU artık kodda sabit (lib/mesaj/
-- tetikleyiciler.ts) — mesaj_kural/mesaj_kredi_bakiye/mesaj_kredi_islem/
-- mesaj_log (bölüm+tetikleyici_adi'yı DB'de tutan, log'u ayrı tabloda tutan
-- eski şema) yerine mesaj_kurallari/mesaj_kredileri/mesaj_kredi_hareketleri/
-- mesaj_kuyrugu (kuyruk AYNI ZAMANDA log'dur) geldi. Yeni klinik açılınca
-- artık 27 satır SEED EDİLMİYOR — kural için DB'de satır yoksa uygulama
-- katmanı "pasif" kabul ediyor, klinik ilk kaydettiğinde upsert ile satır
-- oluşuyor.
--
-- Gerçek üretim verisi taşınıyor: 1 klinik, 27 mesaj_kural satırı (hepsi
-- aktif=true, hasta_dogum_gunu hariç hepsi sadece whatsapp_aktif=true),
-- 750 SMS kredisi + 1 kredi yükleme hareketi (mesaj_log 0 satır — taşınacak
-- gönderim geçmişi yok, aşağıdaki guard bunu doğruluyor). İdempotent, tek blok.

-- 1) Yeni enum tipleri (mesaj_kanal_tipi zaten var, aynen kullanılıyor).
DO $$ BEGIN
  CREATE TYPE mesaj_kredi_hareket_tipi AS ENUM ('yukleme', 'dusum', 'iade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mesaj_kuyruk_durum_tipi AS ENUM ('beklemede', 'gonderiliyor', 'gonderildi', 'hata', 'iptal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mesaj_alici_tipi AS ENUM ('hasta', 'personel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) mesaj_kurallari — bölüm/tetikleyici_adı DB'de YOK (kod kataloğunda),
-- sadece kliniğin üstüne yazdığı ayarlar tutulur. Kayıt yoksa (yeni klinik
-- veya hiç dokunulmamış tetikleyici) uygulama "pasif" kabul eder.
CREATE TABLE IF NOT EXISTS mesaj_kurallari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  tetikleyici_kodu text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  sms_aktif boolean NOT NULL DEFAULT false,
  whatsapp_aktif boolean NOT NULL DEFAULT true,
  mail_aktif boolean NOT NULL DEFAULT false,
  mesaj_metni text NOT NULL DEFAULT '',
  whatsapp_sablon_kodu text,
  zamanlama_offset_dakika integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, tetikleyici_kodu)
);
ALTER TABLE mesaj_kurallari ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kurallari_klinik ON mesaj_kurallari(klinik_id);

DROP TRIGGER IF EXISTS trg_mesaj_kurallari_updated_at ON mesaj_kurallari;
CREATE TRIGGER trg_mesaj_kurallari_updated_at BEFORE UPDATE ON mesaj_kurallari
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) mesaj_kuyrugu — kuyruk AYNI ZAMANDA log'dur, ayrı bir log tablosu YOK.
-- mesaj_kredi_hareketleri.kuyruk_id bu tabloya referans verdiği için
-- mesaj_kredileri/mesaj_kredi_hareketleri'nden ÖNCE oluşturuluyor.
CREATE TABLE IF NOT EXISTS mesaj_kuyrugu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  tetikleyici_kodu text NOT NULL,
  kanal mesaj_kanal_tipi NOT NULL,
  alici_tipi mesaj_alici_tipi NOT NULL,
  alici_id uuid NOT NULL,
  alici_adres text NOT NULL,
  gonderilecek_metin text NOT NULL,
  durum mesaj_kuyruk_durum_tipi NOT NULL DEFAULT 'beklemede',
  planlanan_zaman timestamptz NOT NULL DEFAULT now(),
  gonderim_zamani timestamptz,
  deneme_sayisi integer NOT NULL DEFAULT 0,
  saglayici_mesaj_id text,
  hata_mesaji text,
  idempotency_anahtari text NOT NULL,
  test_mi boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_anahtari)
);
ALTER TABLE mesaj_kuyrugu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kuyrugu_durum_planlanan ON mesaj_kuyrugu(durum, planlanan_zaman);
CREATE INDEX IF NOT EXISTS idx_mesaj_kuyrugu_klinik_created ON mesaj_kuyrugu(klinik_id, created_at DESC);

-- 4) mesaj_kredileri — kanal başına bakiye. Klinik kullanıcısı SADECE okur;
-- bakiye SADECE atomik bir Postgres fonksiyonundan (mesaj_kredi_yukle,
-- ileride mesaj_kredi_dus) değişir, uygulama katmanı asla oku-hesapla-yaz
-- yapmaz.
CREATE TABLE IF NOT EXISTS mesaj_kredileri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kanal mesaj_kanal_tipi NOT NULL,
  bakiye integer NOT NULL DEFAULT 0 CHECK (bakiye >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, kanal)
);
ALTER TABLE mesaj_kredileri ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kredileri_klinik ON mesaj_kredileri(klinik_id);

DROP TRIGGER IF EXISTS trg_mesaj_kredileri_updated_at ON mesaj_kredileri;
CREATE TRIGGER trg_mesaj_kredileri_updated_at BEFORE UPDATE ON mesaj_kredileri
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5) mesaj_kredi_hareketleri — kredi hareket geçmişi (yükleme/düşüm/iade).
-- Not: görev tarifindeki kolon listesinde "tutar" yoktu, ama eski
-- mesaj_kredi_islem.tutar (kredi yüklemede ödenen ₺, örn. gerçek 750 SMS/150₺
-- kaydı) hem UI'da gösteriliyor hem gerçek veri taşıyor — kaybetmemek için
-- nullable olarak eklendi (görev tarifiyle çelişmiyor, üstüne ekleniyor).
CREATE TABLE IF NOT EXISTS mesaj_kredi_hareketleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kanal mesaj_kanal_tipi NOT NULL,
  tip mesaj_kredi_hareket_tipi NOT NULL,
  miktar integer NOT NULL,
  tutar numeric(12, 2),
  aciklama text,
  kuyruk_id uuid REFERENCES mesaj_kuyrugu(id) ON DELETE SET NULL,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mesaj_kredi_hareketleri ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kredi_hareketleri_klinik_kanal ON mesaj_kredi_hareketleri(klinik_id, kanal, created_at DESC);

-- 6) RLS — modülün tamamı klinik_admin'e kilitli (mevcut QR Kodları/İskonto
-- Oranları ile aynı sınıf: otomasyon ayarları + finansal veri). mesaj_kuyrugu
-- ve mesaj_kredileri/mesaj_kredi_hareketleri'nde SADECE SELECT var — yazma
-- (kredi düşümü, kuyruk INSERT/UPDATE) yalnızca SECURITY DEFINER RPC'lerden
-- veya (ileride) service role'den geçer, authenticated'a hiç INSERT/UPDATE
-- policy'si TANIMLANMADI (varsayılan reddediyor).
DROP POLICY IF EXISTS "mesaj_kurallari_select_admin" ON mesaj_kurallari;
CREATE POLICY "mesaj_kurallari_select_admin" ON mesaj_kurallari
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kurallari_yonet_admin" ON mesaj_kurallari;
CREATE POLICY "mesaj_kurallari_yonet_admin" ON mesaj_kurallari
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kredileri_select_admin" ON mesaj_kredileri;
CREATE POLICY "mesaj_kredileri_select_admin" ON mesaj_kredileri
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kredi_hareketleri_select_admin" ON mesaj_kredi_hareketleri;
CREATE POLICY "mesaj_kredi_hareketleri_select_admin" ON mesaj_kredi_hareketleri
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kuyrugu_select_admin" ON mesaj_kuyrugu;
CREATE POLICY "mesaj_kuyrugu_select_admin" ON mesaj_kuyrugu
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- 7) Gerçek veri taşıma — ESKİ tablolar hâlâ mevcutsa (idempotent: migration
-- ikinci kez çalışırsa eski tablolar zaten silinmiş olur, bu blok atlanır).
DO $$
DECLARE
  v_log_sayisi integer;
BEGIN
  IF to_regclass('public.mesaj_kural') IS NOT NULL THEN
    -- mesaj_log'da taşınacak gerçek gönderim geçmişi varsa DURDUR — yeni
    -- mesaj_kuyrugu şeması (alici/metin snapshot, idempotency_anahtari
    -- NOT NULL) eski log satırlarından güvenle türetilemez, elle inceleme
    -- gerekir.
    IF to_regclass('public.mesaj_log') IS NOT NULL THEN
      SELECT count(*) INTO v_log_sayisi FROM mesaj_log;
      IF v_log_sayisi > 0 THEN
        RAISE EXCEPTION 'mesaj_log''da % satır var, otomatik taşınamıyor — migration''ı elle gözden geçirin.', v_log_sayisi;
      END IF;
    END IF;

    INSERT INTO mesaj_kurallari (klinik_id, tetikleyici_kodu, aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni, created_at, updated_at)
    SELECT klinik_id, tetikleyici_kod, aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni, created_at, updated_at
    FROM mesaj_kural
    ON CONFLICT (klinik_id, tetikleyici_kodu) DO NOTHING;

    -- mesaj_kredi_bakiye'de created_at hiç yoktu (sadece updated_at) —
    -- created_at burada kendi DEFAULT now()'ına düşüyor.
    INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye, updated_at)
    SELECT klinik_id, kanal, bakiye, updated_at
    FROM mesaj_kredi_bakiye
    ON CONFLICT (klinik_id, kanal) DO NOTHING;

    INSERT INTO mesaj_kredi_hareketleri (klinik_id, kanal, tip, miktar, tutar, aciklama, olusturan_kullanici_id, created_at)
    SELECT klinik_id, kanal,
      CASE islem_tipi WHEN 'kullanim' THEN 'dusum'::mesaj_kredi_hareket_tipi ELSE islem_tipi::text::mesaj_kredi_hareket_tipi END,
      miktar, tutar, aciklama, olusturan_kullanici_id, created_at
    FROM mesaj_kredi_islem;

    -- Eski otomatik-seed trigger'ı ve tabloları kaldır — yeni model klinik
    -- açılışında satır SEED ETMİYOR.
    DROP TRIGGER IF EXISTS trg_klinik_mesaj_kural_seed ON klinik;
    DROP FUNCTION IF EXISTS mesaj_kural_klinik_seed();
    DROP FUNCTION IF EXISTS mesaj_kural_varsayilan_listesi();
    DROP FUNCTION IF EXISTS mesaj_gonderim_kaydet(uuid, mesaj_bolum_tipi, mesaj_kanal_tipi, text, uuid, boolean);

    DROP TABLE mesaj_log;
    DROP TABLE mesaj_kredi_islem;
    DROP TABLE mesaj_kredi_bakiye;
    DROP TABLE mesaj_kural;
    DROP TYPE IF EXISTS mesaj_bolum_tipi;
    DROP TYPE IF EXISTS mesaj_kredi_islem_tipi;

    RAISE NOTICE 'Eski mesajlaşma şeması yeni tablolara taşındı ve kaldırıldı.';
  END IF;
END $$;

-- 8) mesaj_kredi_yukle — YENİDEN KAPSAMLANDI: artık SADECE süper yönetici
-- çağırabilir (önceden klinik_admin OR super_admin idi). Klinik yöneticisi
-- artık kendi kendine kredi yükleyemez (görev tarifi: "buton onlarda 'talep
-- oluştur'a döner" — panel tarafı ayrı bir kod turunda güncellendi). Ödeme
-- entegrasyonu bu görevin kapsamı dışında, aynen önceki gibi.
CREATE OR REPLACE FUNCTION mesaj_kredi_yukle(
  p_klinik_id uuid,
  p_kanal mesaj_kanal_tipi,
  p_miktar integer,
  p_tutar numeric,
  p_aciklama text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_miktar <= 0 THEN
    RAISE EXCEPTION 'miktar_gecersiz';
  END IF;

  INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye)
  VALUES (p_klinik_id, p_kanal, p_miktar)
  ON CONFLICT (klinik_id, kanal)
  DO UPDATE SET bakiye = mesaj_kredileri.bakiye + EXCLUDED.bakiye, updated_at = now();

  INSERT INTO mesaj_kredi_hareketleri (klinik_id, kanal, tip, miktar, tutar, aciklama, olusturan_kullanici_id)
  VALUES (p_klinik_id, p_kanal, 'yukleme', p_miktar, p_tutar, p_aciklama, auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_kredi_yukle(uuid, mesaj_kanal_tipi, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_kredi_yukle(uuid, mesaj_kanal_tipi, integer, numeric, text) TO authenticated;

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'mesaj_%';
-- SELECT klinik_id, count(*) FROM mesaj_kurallari GROUP BY klinik_id;
-- SELECT klinik_id, kanal, bakiye FROM mesaj_kredileri ORDER BY klinik_id, kanal;
-- SELECT * FROM mesaj_kredi_hareketleri ORDER BY created_at DESC LIMIT 5;
-- SELECT proname FROM pg_proc WHERE proname IN ('mesaj_kredi_yukle','mesaj_kural_klinik_seed','mesaj_gonderim_kaydet');
