-- 0007 (elle yazıldı): Seçenek A — tenant'ı (ve rolü) DB tarafında kullanıcının KENDİ kaydından türet (docs/tasima-plani.md).
--
-- Eskiden current_klinik_id() uygulamanın verdiği app.tenant_id'yi aynen döndürürdü (uygulamaya güven). Artık:
--   * oturumlu kullanıcı (app.user_id dolu): tenant = kullanıcının eşleme satırındaki klinik_id. app.tenant_id YOK SAYILIR.
--     İstisna: rolü super_admin ise (klinik bağlamı yok) app.tenant_id kullanılır (destek amaçlı klinik seçimi; rol DB'den doğrulanır).
--   * kullanıcısız bağlam: app.tenant_id YALNIZ (a) klinik_anonim rolü (tanima çözümlemesinden sonra, SET LOCAL ROLE),
--     (b) bakim_rolu oturumu (sistem bağlamı) ve (c) süper kullanıcı oturumu (kurulum/sağlama) için geçerlidir; aksi hâlde NULL.
--
-- FORCE RLS ÖZYİNELEMESİ YOK: eşleme tablosu RLS'SİZDİR ve hiçbir uygulama rolüne yetki verilmemiştir (yalnız sahibi ve onun DEFINER
-- fonksiyonları okur/yazar); bu yüzden current_klinik_id() kullanici/hasta_kullanici politikalarına (ve onların current_klinik_id() çağrısına) girmez.
SET search_path = public, extensions;

CREATE TABLE kullanici_tenant (
  kullanici_id uuid PRIMARY KEY,
  tur text NOT NULL CHECK (tur IN ('personel', 'hasta')),
  klinik_id uuid,                                   -- super_admin'de NULL
  rol kullanici_rol_tipi,                           -- personelde dolu, hastada NULL
  hasta_id uuid,                                    -- hastada dolu
  aktif boolean NOT NULL DEFAULT true,              -- hasta_kullanici.aktif
  CONSTRAINT kullanici_tenant_tutarlilik CHECK (
    (tur = 'personel' AND rol IS NOT NULL AND hasta_id IS NULL AND (klinik_id IS NOT NULL OR rol = 'super_admin'))
    OR (tur = 'hasta' AND rol IS NULL AND hasta_id IS NOT NULL AND klinik_id IS NOT NULL)
  )
);
-- Hiçbir uygulama rolüne yetki YOK (varsayılan yetkiler 0001'de kapatıldı); açıkça da geri alınır.
REVOKE ALL ON kullanici_tenant FROM PUBLIC, klinik_uygulama, klinik_anonim, bakim_rolu, kimlik_rolu, klinik_tanima;

-- Eşleme tetikleyicileri (DEFINER; sahibi klinik_sahip = tablo sahibi). Tek yazan yol budur.
CREATE FUNCTION kullanici_tenant_kullanici_esle() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM kullanici_tenant WHERE kullanici_id = OLD.id AND tur = 'personel';
    RETURN OLD;
  END IF;
  INSERT INTO kullanici_tenant (kullanici_id, tur, klinik_id, rol)
  VALUES (NEW.id, 'personel', NEW.klinik_id, NEW.rol)
  ON CONFLICT (kullanici_id) DO UPDATE SET tur = 'personel', klinik_id = EXCLUDED.klinik_id, rol = EXCLUDED.rol, hasta_id = NULL, aktif = true;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_kullanici_tenant_esle AFTER INSERT OR UPDATE OF klinik_id, rol OR DELETE ON kullanici
  FOR EACH ROW EXECUTE FUNCTION kullanici_tenant_kullanici_esle();

CREATE FUNCTION kullanici_tenant_hasta_esle() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE v_klinik uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM kullanici_tenant WHERE kullanici_id = OLD.id AND tur = 'hasta';
    RETURN OLD;
  END IF;
  -- hasta'nın kliniği: çağıranın tenant'ında olmayan bir hasta için portal hesabı AÇILAMAZ (RLS hasta satırını göstermez -> NULL -> hata)
  SELECT klinik_id INTO v_klinik FROM hasta WHERE id = NEW.hasta_id;
  IF v_klinik IS NULL THEN RAISE EXCEPTION 'hasta_bulunamadi' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO kullanici_tenant (kullanici_id, tur, klinik_id, rol, hasta_id, aktif)
  VALUES (NEW.id, 'hasta', v_klinik, NULL, NEW.hasta_id, NEW.aktif)
  ON CONFLICT (kullanici_id) DO UPDATE SET tur = 'hasta', klinik_id = EXCLUDED.klinik_id, rol = NULL, hasta_id = EXCLUDED.hasta_id, aktif = EXCLUDED.aktif;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_kullanici_tenant_hasta_esle AFTER INSERT OR UPDATE OF hasta_id, aktif OR DELETE ON hasta_kullanici
  FOR EACH ROW EXECUTE FUNCTION kullanici_tenant_hasta_esle();

REVOKE ALL ON FUNCTION kullanici_tenant_kullanici_esle(), kullanici_tenant_hasta_esle() FROM PUBLIC;

-- Tenant türetme. DEFINER (eşleme tablosunu yalnız sahibi okur), STABLE. Politikalarda (SELECT current_klinik_id()) InitPlan olarak ifade başına bir kez çalışır.
CREATE OR REPLACE FUNCTION current_klinik_id() RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_kullanici uuid := app_kullanici_id();
  v_guc uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
  m kullanici_tenant%ROWTYPE;
BEGIN
  IF v_kullanici IS NOT NULL THEN
    SELECT * INTO m FROM kullanici_tenant WHERE kullanici_id = v_kullanici;
    IF NOT FOUND THEN RETURN NULL; END IF;                        -- eşlemesi olmayan (sahte/silinmiş) kullanıcı: tenant yok
    IF m.tur = 'personel' AND m.rol = 'super_admin' THEN RETURN v_guc; END IF;  -- istisna 1: super_admin klinik seçer
    IF m.tur = 'hasta' AND NOT m.aktif THEN RETURN NULL; END IF;
    RETURN m.klinik_id;                                           -- app.tenant_id YOK SAYILIR
  END IF;
  -- Kullanıcısız bağlam: tenant'ı yalnız güvenilen üç bağlam belirleyebilir.
  --   current_setting('role'): SET [LOCAL] ROLE değeri, SECURITY DEFINER içinde de ÇAĞIRANIN ayarını gösterir (current_user ise sahip olurdu).
  IF current_setting('role', true) = 'klinik_anonim'              -- istisna 2: tanima sonrası anonim akış
     OR session_user = 'bakim_rolu'                               -- istisna 3: bakım betiği sistem bağlamı
     OR (SELECT rolsuper FROM pg_roles WHERE rolname = session_user)  -- kurulum/sağlama (süper kullanıcı oturumu)
  THEN
    RETURN v_guc;
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION current_rol() RETURNS kullanici_rol_tipi
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT rol FROM kullanici_tenant WHERE kullanici_id = app_kullanici_id() AND tur = 'personel' $$;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT coalesce((SELECT rol = 'super_admin' FROM kullanici_tenant WHERE kullanici_id = app_kullanici_id() AND tur = 'personel'), false) $$;

CREATE OR REPLACE FUNCTION current_hasta_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT hasta_id FROM kullanici_tenant WHERE kullanici_id = app_kullanici_id() AND tur = 'hasta' AND aktif $$;

-- Eskiden yalnız rol/kimlik çözümü için gereken "kendi satırı" politikaları artık gereksiz (eşleme tablosu kullanılıyor); kaldırılması
-- özyinelemenin eşleme tablosuyla çözüldüğünün kanıtıdır (tests/db/tenant-turetme.test.ts).
DROP POLICY sahip_kendi_satir ON kullanici;
DROP POLICY sahip_kendi_satir ON hasta_kullanici;

-- Mevcut satırlar için doldurma (boş kurulumda etkisiz). Not: FORCE RLS altında sahip yalnız app.tenant_id'li satırları gördüğünden,
-- dolu bir veritabanında bu migration tenant başına (SET app.tenant_id) ya da süper kullanıcıyla çalıştırılmalıdır.
INSERT INTO kullanici_tenant (kullanici_id, tur, klinik_id, rol) SELECT id, 'personel', klinik_id, rol FROM kullanici ON CONFLICT DO NOTHING;
