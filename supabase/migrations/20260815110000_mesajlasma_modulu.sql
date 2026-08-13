-- Mesajlaşma Modülü: Ayarlar > "WhatsApp, Mail ve Mesaj Ayarları" kartını tam
-- bir mesajlaşma yönetim modülüne çeviriyor. Klinikte tetiklenen olaylara göre
-- (hasta/randevu/personel/muhasebe) hangi kanaldan (SMS/WhatsApp/Mail) bildirim
-- gönderileceği yönetici tarafından yapılandırılabilir; gönderim kredi bazlı
-- (mesaj_kredi_bakiye) çalışır. Gerçek gönderim (mesaj.asistanmerkezi) henüz
-- canlı değil — bu migration sadece veri modelini + atomik RPC'leri kurar,
-- gerçek gönderim TS katmanında (lib/mesajlasma/gonderici.ts) simüle edilir.
-- İdempotent, tek blok.

-- 1) Enum tipleri
DO $$ BEGIN
  CREATE TYPE mesaj_bolum_tipi AS ENUM ('hasta', 'randevu', 'personel', 'muhasebe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mesaj_kanal_tipi AS ENUM ('sms', 'whatsapp', 'mail');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mesaj_kredi_islem_tipi AS ENUM ('yukleme', 'kullanim', 'iade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) mesaj_kural — bölüm başına tetikleyici olay + hangi kanaldan gidecek
CREATE TABLE IF NOT EXISTS mesaj_kural (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  bolum mesaj_bolum_tipi NOT NULL,
  tetikleyici_kod text NOT NULL,
  tetikleyici_adi text NOT NULL,
  sms_aktif boolean NOT NULL DEFAULT false,
  whatsapp_aktif boolean NOT NULL DEFAULT true,
  mail_aktif boolean NOT NULL DEFAULT false,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, tetikleyici_kod)
);
ALTER TABLE mesaj_kural ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kural_klinik_bolum ON mesaj_kural(klinik_id, bolum);

DROP TRIGGER IF EXISTS trg_mesaj_kural_updated_at ON mesaj_kural;
CREATE TRIGGER trg_mesaj_kural_updated_at BEFORE UPDATE ON mesaj_kural
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) mesaj_kredi_bakiye — kanal başına güncel bakiye (klinik başına 3 satır)
CREATE TABLE IF NOT EXISTS mesaj_kredi_bakiye (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kanal mesaj_kanal_tipi NOT NULL,
  bakiye integer NOT NULL DEFAULT 0 CHECK (bakiye >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, kanal)
);
ALTER TABLE mesaj_kredi_bakiye ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kredi_bakiye_klinik ON mesaj_kredi_bakiye(klinik_id);

-- 4) mesaj_kredi_islem — kredi hareketi geçmişi (yükleme/kullanım/iade)
CREATE TABLE IF NOT EXISTS mesaj_kredi_islem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kanal mesaj_kanal_tipi NOT NULL,
  islem_tipi mesaj_kredi_islem_tipi NOT NULL,
  miktar integer NOT NULL,
  tutar numeric(12, 2),
  aciklama text,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mesaj_kredi_islem ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_kredi_islem_klinik_kanal ON mesaj_kredi_islem(klinik_id, kanal, created_at DESC);

-- 5) mesaj_log — ham gönderim kaydı, satır satır (tarih+bölüm bazında ekranda
-- GROUP BY ile toplanır, ham veri tekil satır olarak kalır)
CREATE TABLE IF NOT EXISTS mesaj_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  bolum mesaj_bolum_tipi NOT NULL,
  kanal mesaj_kanal_tipi NOT NULL,
  tetikleyici_kod text NOT NULL,
  hedef_id uuid,
  tarih date NOT NULL DEFAULT current_date,
  adet integer NOT NULL DEFAULT 1 CHECK (adet > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mesaj_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mesaj_log_klinik_tarih ON mesaj_log(klinik_id, tarih);
CREATE INDEX IF NOT EXISTS idx_mesaj_log_klinik_kod_kanal ON mesaj_log(klinik_id, tetikleyici_kod, kanal, created_at DESC);

-- 6) RLS — modülün tamamı klinik_admin'e kilitli (kredi/finansal veri +
-- otomasyon ayarları, mevcut QR Kodları/İskonto Oranları/Kamusal Giderler ile
-- aynı sınıf). Yazma tarafı (kredi düşümü, log, kredi yükleme) SECURITY
-- DEFINER RPC'lerden geçiyor (RLS'i bypass eder) — bu yüzden mesaj_kredi_bakiye/
-- mesaj_kredi_islem/mesaj_log'a ayrıca bir INSERT/UPDATE policy'si YOK, sadece
-- SELECT var (ekranda gösterim için). mesaj_kural'ın checkbox/switch'lerle
-- doğrudan düzenlenmesi gerektiği için o tabloya ayrıca bir ALL policy'si var.
DROP POLICY IF EXISTS "mesaj_kural_select_admin" ON mesaj_kural;
CREATE POLICY "mesaj_kural_select_admin" ON mesaj_kural
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kural_yonet_admin" ON mesaj_kural;
CREATE POLICY "mesaj_kural_yonet_admin" ON mesaj_kural
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kredi_bakiye_select_admin" ON mesaj_kredi_bakiye;
CREATE POLICY "mesaj_kredi_bakiye_select_admin" ON mesaj_kredi_bakiye
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_kredi_islem_select_admin" ON mesaj_kredi_islem;
CREATE POLICY "mesaj_kredi_islem_select_admin" ON mesaj_kredi_islem
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "mesaj_log_select_admin" ON mesaj_log;
CREATE POLICY "mesaj_log_select_admin" ON mesaj_log
  FOR SELECT USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- 7) Varsayılan kural listesi — tek kaynak, hem yeni klinik trigger'ı hem
-- mevcut klinikler için tek seferlik backfill bunu kullanıyor (27 satır:
-- hasta 9, randevu 6, personel 6, muhasebe 6). Varsayılan sms_aktif=false/
-- whatsapp_aktif=true/mail_aktif=false/aktif=true zaten kolon DEFAULT'larından
-- geliyor, burada tekrar yazılmıyor.
CREATE OR REPLACE FUNCTION mesaj_kural_varsayilan_listesi()
RETURNS TABLE (bolum mesaj_bolum_tipi, tetikleyici_kod text, tetikleyici_adi text)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('hasta'::mesaj_bolum_tipi, 'hasta_kayit_hosgeldin', 'Kayıt olunca hoş geldiniz mesajı'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_satis_ozet', 'Paket satın alınca paket özeti'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_seans_azaldi', 'Paket seans hakkı azaldığında uyarı'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_sure_bitiyor', 'Paket süresi dolmadan hatırlatma'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_ilk_seans_anket', 'İlk seans sonrası memnuniyet anketi'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_seans_sonrasi_anket', 'Her seans sonrası kısa anket'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_program_tamamlandi', 'Tedavi programı tamamlandığında kapanış anketi'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_dogum_gunu', 'Doğum günü kutlaması'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_ozledik', 'Uzun süredir gelmeyen hastaya hatırlatma'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_onay', 'Randevu oluşturulunca onay mesajı'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_hatirlatma_1gun', 'Randevudan 1 gün önce hatırlatma'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_hatirlatma_2saat', 'Randevudan 2 saat önce hatırlatma'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_iptal', 'Randevu iptal/erteleme bildirimi'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_gelmedi', 'Randevuya gelmedi (no-show) sonrası mesaj'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_sonraki_oneri', 'Randevu sonrası sıradaki randevu önerisi'),
    ('personel'::mesaj_bolum_tipi, 'personel_hosgeldin', 'İşe başlama hoş geldiniz mesajı'),
    ('personel'::mesaj_bolum_tipi, 'personel_gunluk_program', 'Günlük vardiya/randevu programı bildirimi'),
    ('personel'::mesaj_bolum_tipi, 'personel_bordro_hazir', 'Maaş bordrosu hazır bildirimi'),
    ('personel'::mesaj_bolum_tipi, 'personel_performans_ozet', 'Aylık performans/prim özeti'),
    ('personel'::mesaj_bolum_tipi, 'personel_izin_sonuc', 'İzin talebi onay/red bildirimi'),
    ('personel'::mesaj_bolum_tipi, 'personel_egitim_hatirlatma', 'Eğitim/toplantı hatırlatması'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_fatura_kesildi', 'Fatura kesildi bildirimi'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_yaklasiyor', 'Ödeme vadesi yaklaşıyor hatırlatması'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_gecikti', 'Ödeme gecikmesi uyarısı'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_alindi', 'Ödeme alındı teşekkür mesajı'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_taksit_hatirlatma', 'Sıradaki taksit hatırlatması'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_donem_ekstre', 'Dönem sonu mutabakat/ekstre bildirimi')
$$;

-- 8) Yeni klinik oluşunca otomatik seed (projede henüz kod içinden bir "klinik
-- oluşturma akışı" yok, super_admin kliniği DB'ye elle/dashboard'dan ekliyor —
-- bu yüzden en güvenilir "onboarding kancası" burada bir DB trigger'ı).
CREATE OR REPLACE FUNCTION mesaj_kural_klinik_seed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO mesaj_kural (klinik_id, bolum, tetikleyici_kod, tetikleyici_adi)
  SELECT NEW.id, v.bolum, v.tetikleyici_kod, v.tetikleyici_adi
  FROM mesaj_kural_varsayilan_listesi() v
  ON CONFLICT (klinik_id, tetikleyici_kod) DO NOTHING;

  INSERT INTO mesaj_kredi_bakiye (klinik_id, kanal)
  SELECT NEW.id, k FROM unnest(enum_range(NULL::mesaj_kanal_tipi)) AS k
  ON CONFLICT (klinik_id, kanal) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_klinik_mesaj_kural_seed ON klinik;
CREATE TRIGGER trg_klinik_mesaj_kural_seed AFTER INSERT ON klinik
  FOR EACH ROW EXECUTE FUNCTION mesaj_kural_klinik_seed();

-- 9) Mevcut klinikler için tek seferlik backfill (idempotent — ON CONFLICT DO
-- NOTHING sayesinde migration tekrar çalışsa da zarar vermez).
INSERT INTO mesaj_kural (klinik_id, bolum, tetikleyici_kod, tetikleyici_adi)
SELECT k.id, v.bolum, v.tetikleyici_kod, v.tetikleyici_adi
FROM klinik k
CROSS JOIN mesaj_kural_varsayilan_listesi() v
ON CONFLICT (klinik_id, tetikleyici_kod) DO NOTHING;

INSERT INTO mesaj_kredi_bakiye (klinik_id, kanal)
SELECT k.id, kanal
FROM klinik k
CROSS JOIN unnest(enum_range(NULL::mesaj_kanal_tipi)) AS kanal
ON CONFLICT (klinik_id, kanal) DO NOTHING;

-- 10) mesaj_kredi_yukle — admin manuel kredi yükleme (ödeme entegrasyonu YOK,
-- TODO: payment-integration skill'i geldiğinde bu RPC'nin öncesine gerçek bir
-- ödeme adımı eklenecek, imza muhtemelen değişmeyecek). odeme_olustur/
-- hasta_bakiye_hareket_borc_duzenle ile aynı desen: bakiye + islem tek
-- transactionda, klinik_id daima sunucu session'ından doğrulanıyor.
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
  IF NOT COALESCE(
    is_super_admin() OR (current_rol() = 'klinik_admin' AND current_klinik_id() = p_klinik_id),
    false
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_miktar <= 0 THEN
    RAISE EXCEPTION 'miktar_gecersiz';
  END IF;

  INSERT INTO mesaj_kredi_bakiye (klinik_id, kanal, bakiye)
  VALUES (p_klinik_id, p_kanal, p_miktar)
  ON CONFLICT (klinik_id, kanal)
  DO UPDATE SET bakiye = mesaj_kredi_bakiye.bakiye + EXCLUDED.bakiye, updated_at = now();

  INSERT INTO mesaj_kredi_islem (klinik_id, kanal, islem_tipi, miktar, tutar, aciklama, olusturan_kullanici_id)
  VALUES (p_klinik_id, p_kanal, 'yukleme', p_miktar, p_tutar, p_aciklama, auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_kredi_yukle(uuid, mesaj_kanal_tipi, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_kredi_yukle(uuid, mesaj_kanal_tipi, integer, numeric, text) TO authenticated;

-- 11) mesaj_gonderim_kaydet — TÜM gönderim mantığının tek atomik girişi:
-- kural aktif mi + ilgili kanal açık mı kontrol eder, kapalıysa SESSİZCE
-- {gonderildi:false} döner (log atmaz — spec: "Kapalıysa sessizce çık, log
-- atma"); açıksa bakiyeyi FOR UPDATE ile kilitleyip düşer, kullanım kaydı +
-- log satırı ekler; bakiye yetersizse RAISE EXCEPTION (log ATILMAZ — hiç
-- gönderim gerçekleşmedi). lib/mesajlasma/gonderici.ts bu RPC'yi çağırıp
-- gonderildi=true ise "gerçek gönderim" simülasyonunu (console.log) DB
-- transaction'ının DIŞINDA yapar.
--
-- p_test=true iken (Ayarlar ekranındaki "Test Gönder" ikonu) abuse'a karşı
-- basit bir throttle var: aynı (klinik_id, tetikleyici_kod, kanal) için son
-- 5 saniye içinde bir log satırı varsa reddedilir. Gerçek/otomatik gönderim
-- yollarını ETKİLEMEZ (p_test=false ise bu kontrol hiç çalışmaz) — aksi halde
-- örn. art arda birkaç hastaya aynı anda "randevu_onay" gönderilmesi
-- yanlışlıkla bloklanırdı.
CREATE OR REPLACE FUNCTION mesaj_gonderim_kaydet(
  p_klinik_id uuid,
  p_bolum mesaj_bolum_tipi,
  p_kanal mesaj_kanal_tipi,
  p_tetikleyici_kod text,
  p_hedef_id uuid DEFAULT NULL,
  p_test boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_kural mesaj_kural%ROWTYPE;
  v_kanal_aktif boolean;
  v_bakiye integer;
  v_son_log timestamptz;
BEGIN
  IF NOT COALESCE(
    is_super_admin()
    OR (current_klinik_id() = p_klinik_id AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')),
    false
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_test THEN
    SELECT created_at INTO v_son_log
    FROM mesaj_log
    WHERE klinik_id = p_klinik_id AND tetikleyici_kod = p_tetikleyici_kod AND kanal = p_kanal
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_son_log IS NOT NULL AND v_son_log > now() - interval '5 seconds' THEN
      RAISE EXCEPTION 'cok_sik_deneme';
    END IF;
  END IF;

  SELECT * INTO v_kural FROM mesaj_kural WHERE klinik_id = p_klinik_id AND tetikleyici_kod = p_tetikleyici_kod;

  IF NOT FOUND OR NOT v_kural.aktif THEN
    RETURN jsonb_build_object('gonderildi', false, 'sebep', 'kural_kapali');
  END IF;

  IF p_bolum IS DISTINCT FROM v_kural.bolum THEN
    RAISE EXCEPTION 'bolum_uyumsuz';
  END IF;

  v_kanal_aktif := CASE p_kanal
    WHEN 'sms' THEN v_kural.sms_aktif
    WHEN 'whatsapp' THEN v_kural.whatsapp_aktif
    WHEN 'mail' THEN v_kural.mail_aktif
  END;

  IF NOT v_kanal_aktif THEN
    RETURN jsonb_build_object('gonderildi', false, 'sebep', 'kanal_kapali');
  END IF;

  SELECT bakiye INTO v_bakiye
  FROM mesaj_kredi_bakiye
  WHERE klinik_id = p_klinik_id AND kanal = p_kanal
  FOR UPDATE;

  IF v_bakiye IS NULL OR v_bakiye < 1 THEN
    RAISE EXCEPTION 'yetersiz_bakiye';
  END IF;

  UPDATE mesaj_kredi_bakiye
  SET bakiye = bakiye - 1, updated_at = now()
  WHERE klinik_id = p_klinik_id AND kanal = p_kanal;

  INSERT INTO mesaj_kredi_islem (klinik_id, kanal, islem_tipi, miktar, aciklama, olusturan_kullanici_id)
  VALUES (p_klinik_id, p_kanal, 'kullanim', -1, v_kural.tetikleyici_adi, auth.uid());

  INSERT INTO mesaj_log (klinik_id, bolum, kanal, tetikleyici_kod, hedef_id)
  VALUES (p_klinik_id, p_bolum, p_kanal, p_tetikleyici_kod, p_hedef_id);

  RETURN jsonb_build_object('gonderildi', true);
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_gonderim_kaydet(uuid, mesaj_bolum_tipi, mesaj_kanal_tipi, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_gonderim_kaydet(uuid, mesaj_bolum_tipi, mesaj_kanal_tipi, text, uuid, boolean) TO authenticated;

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('mesaj_kural','mesaj_kredi_bakiye','mesaj_kredi_islem','mesaj_log');
-- SELECT policyname, cmd FROM pg_policies WHERE tablename LIKE 'mesaj_%' ORDER BY tablename, cmd;
-- SELECT klinik_id, count(*) FROM mesaj_kural GROUP BY klinik_id;
-- SELECT klinik_id, kanal, bakiye FROM mesaj_kredi_bakiye ORDER BY klinik_id, kanal;
-- SELECT proname FROM pg_proc WHERE proname IN ('mesaj_kredi_yukle','mesaj_gonderim_kaydet','mesaj_kural_klinik_seed');
