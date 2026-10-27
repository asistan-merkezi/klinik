-- 0005 (elle yazıldı): (1) kimlik katmanının tenant bağlantıları ve giriş tanımlayıcıları, (2) anonim INSERT boşluğunun DB düzeyinde kapatılması.
-- Karar kaynağı: docs/giris-akislari.md (Seçenek D), docs/tasima-plani.md Aşama 3.
SET search_path = public, extensions;

-- 1) kimlik_kullanici: giriş tanımlayıcıları ve tenant bağlantısı. Giriş öncesinde tenant tablolarına (kullanici, hasta) erişilemediğinden
--    (kimlik_rolu yalnız kimlik tablolarını görür) çözümleme için gereken asgari alanlar burada tutulur.
ALTER TABLE kimlik_kullanici
  ADD COLUMN tur text NOT NULL DEFAULT 'personel' CHECK (tur IN ('personel', 'hasta')),
  ADD COLUMN klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,        -- hasta için zorunlu: portal klinik içinde çözülür
  ADD COLUMN hasta_id uuid REFERENCES hasta(id) ON DELETE CASCADE,          -- hasta silinirse kimlik hesabı da gider
  ADD COLUMN telefon_norm text GENERATED ALWAYS AS (telefon_normalize(telefon)) STORED,
  ADD COLUMN telefonla_giris boolean NOT NULL DEFAULT false,                -- personel: rol telefonla girebilir mi (klinik_admin/super_admin = false)
  ADD COLUMN sifre_degistirmeli boolean NOT NULL DEFAULT false,             -- geçici şifreyle girildi: değiştirmeden başka sayfaya geçilemez
  ADD COLUMN gecici_sifre_bitis timestamptz,                                -- geçici şifre son kullanma (hasta: 7 gün)
  ADD CONSTRAINT kimlik_tur_alanlari CHECK (
    (tur = 'hasta' AND klinik_id IS NOT NULL AND hasta_id IS NOT NULL AND NOT telefonla_giris)
    OR (tur = 'personel' AND hasta_id IS NULL)
  );
-- Personel telefonu GLOBAL tekil; hasta telefonu yalnız klinik İÇİNDE tekil (klinikler arası aynı numara serbest).
CREATE UNIQUE INDEX kimlik_personel_telefon_tekil ON kimlik_kullanici (telefon_norm) WHERE tur = 'personel' AND telefon_norm IS NOT NULL;
CREATE UNIQUE INDEX kimlik_hasta_klinik_telefon_tekil ON kimlik_kullanici (klinik_id, telefon_norm) WHERE tur = 'hasta' AND telefon_norm IS NOT NULL;
CREATE UNIQUE INDEX kimlik_hasta_tekil ON kimlik_kullanici (hasta_id) WHERE hasta_id IS NOT NULL;
CREATE INDEX kimlik_klinik ON kimlik_kullanici (klinik_id);

-- Tenant tablosundan kimlik kaydına bağ: kullanici.id ve hasta_kullanici.id zaten kimlik_kullanici(id)'ye FK (ortak anahtar).
-- Bağlantının ters yönü (kimlik -> hasta) yukarıdaki hasta_id kolonudur.

-- Better Auth account tablosunun beklediği (kullanılmayan, OAuth) kolonlar: şema doğrulaması (validateSchema) açık kalsın diye eklendi.
ALTER TABLE kimlik_hesap
  ADD COLUMN access_token text, ADD COLUMN refresh_token text, ADD COLUMN id_token text,
  ADD COLUMN access_token_bitis timestamptz, ADD COLUMN refresh_token_bitis timestamptz, ADD COLUMN scope text;

-- telefon_normalize üretilmiş kolonda kullanılır; kimlik_rolu'nün INSERT sırasında çağırabilmesi gerekir (saf fonksiyon).
GRANT EXECUTE ON FUNCTION telefon_normalize(text) TO kimlik_rolu;

-- 2) Anonim INSERT'leri DB düzeyinde kapat: bağlam (app.tenant_id) satırın klinik_id'siyle AYNI olmalı ve ilgili QR/form o klinikte AÇIK olmalı.
--    Böylece tenant bağlamını unutan ya da başka kliniğin UUID'sini gönderen anonim istek DB'de reddedilir.
--    NOT: app.tenant_id'yi uygulama koyar (güvenilen kaynak: tanima.klinik_qr_bilgisi_getir ile çözülen kısa kod). İstemciden gelen klinik_id ASLA tenant olarak kullanılmaz.
DROP POLICY hasta_insert_qr_kayit ON hasta;
CREATE POLICY hasta_insert_qr_kayit ON hasta AS PERMISSIVE FOR INSERT TO klinik_anonim
  WITH CHECK (kayit_kanali = 'qr_self_servis' AND kvkk_onay_tarihi IS NOT NULL AND kvkk_onaylayan_tip = 'hasta'
              AND klinik_id = current_klinik_id() AND qr_kodu_aktif_mi(klinik_id, 'hasta_on_kayit'));
DROP POLICY anket_yaniti_insert_anon ON anket_yaniti;
CREATE POLICY anket_yaniti_insert_anon ON anket_yaniti AS PERMISSIVE FOR INSERT TO klinik_anonim
  WITH CHECK (klinik_id = current_klinik_id() AND qr_kodu_aktif_mi(klinik_id, 'anket'));
DROP POLICY is_basvurusu_insert_anon ON is_basvurusu;
CREATE POLICY is_basvurusu_insert_anon ON is_basvurusu AS PERMISSIVE FOR INSERT TO klinik_anonim
  WITH CHECK (durum = 'beklemede' AND degerlendiren_kullanici_id IS NULL AND degerlendirme_tarihi IS NULL AND personel_id IS NULL
              AND klinik_id = current_klinik_id());
-- hasta_hassas (hasta_qr_self_servis_mi) ve seans_degerlendirme (randevu_anket_uygun_mu) politikaları DEFINER fonksiyonlar üzerinden tenant'a
-- zaten bağlıdır (fonksiyonlar FORCE RLS altında yalnız aktif tenant'ın satırını görür); değişiklik gerekmedi.
