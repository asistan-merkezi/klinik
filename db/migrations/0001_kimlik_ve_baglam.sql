-- Kimlik tabloları (Better Auth, credentials) ve bağlam fonksiyonları.
-- Better Auth alan eşlemesi Aşama 4'te kütüphane sürümüne karşı doğrulanacak (docs/sema-esleme.md).
-- Çalıştıran rol: klinik_sahip.
SET search_path = public, extensions;

-- Varsayılan yetkiler KAPALI: klinik_sahip'in bundan sonra yaratacağı hiçbir nesne PUBLIC'e açık gelmez (özellikle fonksiyonlarda EXECUTE).
ALTER DEFAULT PRIVILEGES FOR ROLE klinik_sahip IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE klinik_sahip IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
-- NOT: fonksiyonlardaki PUBLIC EXECUTE varsayılanı ŞEMA-bağımsız (global) olduğundan 'IN SCHEMA' kullanılmaz; aksi hâlde etkisizdir.
ALTER DEFAULT PRIVILEGES FOR ROLE klinik_sahip REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE kimlik_kullanici (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad text NOT NULL DEFAULT '',
  eposta text NOT NULL UNIQUE,
  eposta_dogrulandi boolean NOT NULL DEFAULT false,
  telefon text,
  gorsel text,
  devre_disi boolean NOT NULL DEFAULT false,      -- işten çıkış / hesap kapatma (eski auth ban yerine)
  devre_disi_zamani timestamptz,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kimlik_hesap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES kimlik_kullanici(id) ON DELETE CASCADE,
  saglayici_id text NOT NULL DEFAULT 'credential',
  hesap_id text NOT NULL,
  parola_hash text,                               -- argon2
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saglayici_id, hesap_id)
);

-- Oturum tablosu: tek oturum kilidi taşımadan SONRA eklenecek; şema buna hazır (cihaz_kimligi, son_etkinlik).
CREATE TABLE oturum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES kimlik_kullanici(id) ON DELETE CASCADE,
  jeton text NOT NULL UNIQUE,
  bitis timestamptz NOT NULL,
  cihaz_kimligi text,                             -- tarayıcıda httpOnly cookie ile üretilen rastgele kimlik
  ip_hash text,                                   -- IP düz saklanmaz (KVKK), kısa SHA-256
  user_agent text,
  ilk_etkinlik timestamptz NOT NULL DEFAULT now(),
  son_etkinlik timestamptz NOT NULL DEFAULT now(),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oturum_kullanici_son_etkinlik ON oturum (kullanici_id, son_etkinlik DESC);

CREATE TABLE kimlik_dogrulama (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanimlayici text NOT NULL,
  deger text NOT NULL,
  bitis timestamptz NOT NULL,
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz NOT NULL DEFAULT now()
);

-- Bağlam: uygulama transaction başına SET LOCAL ile verir. Tarayıcıdan gelen hiçbir değer doğrudan buraya yazılmaz.
CREATE FUNCTION app_kullanici_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION current_klinik_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Sistem işi (scripts/ bakım betikleri) = oturum rolü bakim_rolu. SET ROLE ile taklit edilemez (session_user).
-- Uygulama bağlantısı klinik_uygulama olduğundan hiçbir istekte true dönmez. RLS'i ATLAMAZ.
CREATE FUNCTION sistem_baglami() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT session_user = 'bakim_rolu' $$;

-- Kimlik tabloları YALNIZ kimlik_rolu (Better Auth bağlantısı) tarafından erişilir; klinik_uygulama, klinik_anonim, bakim_rolu
-- bu tablolarda HİÇBİR yetkiye sahip değildir. (Tablo sahibi klinik_sahip'in DEFINER giriş fonksiyonları sahip olarak okur: docs/giris-akislari.md.)
REVOKE ALL ON kimlik_kullanici, kimlik_hesap, oturum, kimlik_dogrulama FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON kimlik_kullanici, kimlik_hesap, oturum, kimlik_dogrulama TO kimlik_rolu;
GRANT EXECUTE ON FUNCTION app_kullanici_id(), current_klinik_id() TO klinik_uygulama, klinik_anonim, bakim_rolu;
GRANT EXECUTE ON FUNCTION sistem_baglami() TO klinik_uygulama, klinik_anonim, bakim_rolu;
