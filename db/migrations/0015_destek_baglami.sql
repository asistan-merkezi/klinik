-- 0015 (elle yazıldı): Modül 6 — destek bağlamı (super_admin), audit_log erişimi, denetim detayında hassas alan temizliği.
--
-- 1) DESTEK BAĞLAMI. super_admin'in klinik verisine erişimi yalnız SÜRE SINIRLI ve DENETLENEN bir destek bağlamıyla mümkündür:
--    * destek_baglami_ac(klinik, gerekçe, dakika) → kayıt + audit_log satırı; en çok 120 dk; gerekçe ≥ 10 karakter; aynı anda tek aktif bağlam.
--    * current_klinik_id() super_admin için app.tenant_id'yi YALNIZ o klinik için AKTİF (kapatılmamış, süresi dolmamış) bir bağlam varsa döndürür;
--      aksi hâlde NULL. Süre sınırı bu yüzden uygulamaya değil VERİTABANINA bağlıdır (süre dolunca tenant bağlamı kendiliğinden düşer).
--    * Klinik OLUŞTURMA web yüzeyinde YOK (klinik_uygulama'nın klinik üzerinde INSERT yetkisi yok): sağlama (provisioning) işlemi olarak kalır.
-- 2) audit_log SELECT politikası: eski "OR is_super_admin()" (tüm kliniklerin denetim kaydı) kalktı. Yalnız klinik_admin kendi kliniğini;
--    super_admin yalnız aktif destek bağlamındaki kliniği (current_klinik_id() zaten bunu sınırlar) görür.
-- 3) audit_detay_temizle(jsonb): denetim satırının DETAYINDAN hassas alan DEĞERLERİNİ (maaş, T.C. kimlik, pasaport, IBAN, sağlık notları, parola/jeton)
--    yazarken siler ("[gizli]"). Hem audit_log_yaz (v1) hem audit_log_degisiklik_yaz (v2) kullanır. Mevcut satırlar değişmez (audit_log'a UPDATE yetkisi yok);
--    gösterimde ayrıca maskelenir (lib/denetim/maskele.ts).
SET search_path = public, extensions;

-- ---------------------------------------------------------------- 1) destek_baglami
CREATE TABLE destek_baglami (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES kullanici(id) ON DELETE CASCADE,       -- super_admin
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  gerekce text NOT NULL,
  baslangic timestamptz NOT NULL DEFAULT now(),
  bitis timestamptz NOT NULL,
  kapatildi timestamptz,
  CONSTRAINT destek_baglami_gerekce_uzunluk CHECK (char_length(btrim(gerekce)) BETWEEN 10 AND 500),
  CONSTRAINT destek_baglami_sure CHECK (bitis > baslangic AND bitis <= baslangic + interval '120 minutes')
);
CREATE INDEX idx_destek_baglami_aktif ON destek_baglami (kullanici_id, klinik_id) WHERE kapatildi IS NULL;
CREATE INDEX idx_destek_baglami_klinik ON destek_baglami (klinik_id);
ALTER TABLE destek_baglami ENABLE ROW LEVEL SECURITY;
ALTER TABLE destek_baglami FORCE ROW LEVEL SECURITY;
-- Hiçbir uygulama rolünün yetkisi yok; yalnız aşağıdaki DEFINER fonksiyonlar (sahip klinik_sahip) okur/yazar. Politika yalnız sahip içindir.
CREATE POLICY sahip_destek_baglami ON destek_baglami AS PERMISSIVE FOR ALL TO klinik_sahip USING (true) WITH CHECK (true);
REVOKE ALL ON destek_baglami FROM PUBLIC, klinik_uygulama, klinik_anonim, bakim_rolu, kimlik_rolu, klinik_tanima;

-- tenant türetme: super_admin app.tenant_id'yi yalnız AKTİF destek bağlamı varsa kullanabilir (0007'nin istisna 1'i daraltıldı)
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
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF m.tur = 'personel' AND m.rol = 'super_admin' THEN
      IF v_guc IS NOT NULL AND EXISTS (
        SELECT 1 FROM destek_baglami d
         WHERE d.kullanici_id = v_kullanici AND d.klinik_id = v_guc AND d.kapatildi IS NULL AND d.bitis > now()
      ) THEN RETURN v_guc; END IF;
      RETURN NULL;                                                -- aktif destek bağlamı yok: klinik bağlamı yok
    END IF;
    IF m.tur = 'hasta' AND NOT m.aktif THEN RETURN NULL; END IF;
    RETURN m.klinik_id;                                           -- app.tenant_id YOK SAYILIR
  END IF;
  IF current_setting('role', true) = 'klinik_anonim'
     OR session_user = 'bakim_rolu'
     OR (SELECT rolsuper FROM pg_roles WHERE rolname = session_user)
  THEN
    RETURN v_guc;
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION destek_baglami_ac(p_klinik_id uuid, p_gerekce text, p_dakika integer DEFAULT 30) RETURNS timestamptz
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_kullanici uuid := app_kullanici_id();
  v_bitis timestamptz;
  v_onceki integer;
BEGIN
  IF v_kullanici IS NULL OR NOT is_super_admin() THEN RAISE EXCEPTION 'yetkisiz'; END IF;
  IF p_dakika IS NULL OR p_dakika < 5 OR p_dakika > 120 THEN RAISE EXCEPTION 'sure_gecersiz'; END IF;
  IF p_gerekce IS NULL OR char_length(btrim(p_gerekce)) < 10 OR char_length(btrim(p_gerekce)) > 500 THEN RAISE EXCEPTION 'gerekce_gecersiz'; END IF;

  UPDATE destek_baglami SET kapatildi = now() WHERE kullanici_id = v_kullanici AND kapatildi IS NULL AND bitis > now();
  GET DIAGNOSTICS v_onceki = ROW_COUNT;

  v_bitis := now() + make_interval(mins => p_dakika);
  BEGIN
    INSERT INTO destek_baglami (kullanici_id, klinik_id, gerekce, bitis) VALUES (v_kullanici, p_klinik_id, btrim(p_gerekce), v_bitis);
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'klinik_bulunamadi';
  END;

  -- Denetim satırı hedef kliniğin kaydı olarak yazılır (klinik_admin kendi denetim geçmişinde destek erişimini görür). Yazma için tenant bağlamı gerekir:
  -- bağlam az önce açıldığı için current_klinik_id() artık bu kliniği döndürür.
  PERFORM set_config('app.tenant_id', p_klinik_id::text, true);
  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (p_klinik_id, v_kullanici, 'destek_baglami_ac', 'klinik', p_klinik_id,
          jsonb_build_object('surum', 2, 'gerekce', btrim(p_gerekce), 'dakika', p_dakika, 'bitis', v_bitis, 'onceki_kapatilan', v_onceki));
  RETURN v_bitis;
END
$$;

CREATE FUNCTION destek_baglami_kapat() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_kullanici uuid := app_kullanici_id();
  d destek_baglami%ROWTYPE;
BEGIN
  IF v_kullanici IS NULL OR NOT is_super_admin() THEN RAISE EXCEPTION 'yetkisiz'; END IF;
  SELECT * INTO d FROM destek_baglami WHERE kullanici_id = v_kullanici AND kapatildi IS NULL AND bitis > now() ORDER BY baslangic DESC LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM set_config('app.tenant_id', d.klinik_id::text, true);   -- bağlam hâlâ aktif iken denetim satırı yazılır
  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (d.klinik_id, v_kullanici, 'destek_baglami_kapat', 'klinik', d.klinik_id, jsonb_build_object('surum', 2, 'baslangic', d.baslangic, 'bitis', d.bitis));
  UPDATE destek_baglami SET kapatildi = now() WHERE id = d.id;
  RETURN true;
END
$$;

CREATE FUNCTION destek_baglami_aktif() RETURNS TABLE (klinik_id uuid, bitis timestamptz, gerekce text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT d.klinik_id, d.bitis, d.gerekce FROM destek_baglami d
   WHERE d.kullanici_id = app_kullanici_id() AND is_super_admin() AND d.kapatildi IS NULL AND d.bitis > now()
   ORDER BY d.baslangic DESC LIMIT 1
$$;

REVOKE ALL ON FUNCTION destek_baglami_ac(uuid, text, integer), destek_baglami_kapat(), destek_baglami_aktif() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION destek_baglami_ac(uuid, text, integer), destek_baglami_kapat(), destek_baglami_aktif() TO klinik_uygulama;

-- ---------------------------------------------------------------- 2) audit_log SELECT politikası
DROP POLICY audit_log_select_admin ON audit_log;
CREATE POLICY audit_log_select_admin ON audit_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'super_admin'));
-- INSERT politikasındaki "OR is_super_admin()" da daraltılır: yazma yalnız kendi tenant'ına (DEFINER tetikleyiciler tenant bağlamında çalışır).
DROP POLICY audit_log_insert_klinik ON audit_log;
CREATE POLICY audit_log_insert_klinik ON audit_log AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (klinik_id = (SELECT current_klinik_id()));

-- ---------------------------------------------------------------- 2b) destek_talebi politikaları
-- Serbest metin kişisel/sağlık verisi içerebilir: kendi talebin + (klinik_admin | destek bağlamındaki super_admin) kendi kliniğinin talepleri.
-- Eski "OR is_super_admin()" (tüm kliniklerin talepleri) kalktı.
DROP POLICY destek_talebi_select ON destek_talebi;
CREATE POLICY destek_talebi_select ON destek_talebi AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (kullanici_id = app_kullanici_id() OR (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'super_admin')));
DROP POLICY destek_talebi_update ON destek_talebi;
CREATE POLICY destek_talebi_update ON destek_talebi AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'super_admin'))
  WITH CHECK (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'super_admin'));

-- ---------------------------------------------------------------- 2c) ZORUNLU TENANT SINIRI (RESTRICTIVE)
-- 166 politika "OR is_super_admin()" dalı taşıyordu: super_admin, tenant bağlamından BAĞIMSIZ olarak TÜM kliniklerin satırlarını görebiliyordu. Destek bağlamı
-- super_admin'e bir klinik bağlamı verdiği için (liste sayfaları klinik filtresi yerine RLS'e güvenir) bu, bağlamdaki bir super_admin'in diğer kliniklerin
-- verisini de görmesi demekti. Çözüm: klinik_id kolonlu her RLS'li tablo için klinik_uygulama rolüne RESTRICTIVE politika — mevcut izin politikalarıyla VE'lenir:
--   satırın kliniği = current_klinik_id()  (super_admin için bu YALNIZ aktif destek bağlamındaki klinik; bağlam yoksa NULL → hiçbir satır).
-- klinik_id NULL olabilen tablolarda (global satırlar, ör. resmi_tatil) NULL satırlar serbest kalır. `klinik` tablosunun kendisi kapsam dışıdır
-- (id kolonu; super_admin destek bağlamı açarken klinik listesini görebilmeli — içinde hasta/kişi verisi yok).
DO $$
DECLARE
  t record;
  kosul text;
BEGIN
  FOR t IN
    SELECT c.relname, a.attnotnull
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'klinik_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND c.relrowsecurity
       AND c.relname <> 'destek_baglami'
  LOOP
    kosul := CASE WHEN t.attnotnull THEN 'klinik_id = (SELECT current_klinik_id())' ELSE 'klinik_id IS NULL OR klinik_id = (SELECT current_klinik_id())' END;
    EXECUTE format('CREATE POLICY zorunlu_tenant_siniri ON %I AS RESTRICTIVE FOR ALL TO klinik_uygulama, klinik_sahip USING (%s) WITH CHECK (%s)', t.relname, kosul, kosul);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- 3) hassas alan temizliği
CREATE FUNCTION audit_detay_temizle(p jsonb) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE SET search_path = public AS
$$
DECLARE
  r jsonb := '{}'::jsonb;
  k text;
  v jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN p; END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
    IF k ~* '(tc_?kimlik|pasaport|iban|maas|ucret|fm_saatlik|sifre|parola|token|secret|anamnez|saglik|ozgecmis|sikayet|agri_oykusu|degerlendirme_notu|ilac|cevaplar|hasta_notu|notlar|oneri_metni|(^|_)gerekce$|kart_no|cvv|imza_storage_path|storage_path)' AND v <> 'null'::jsonb THEN
      r := r || jsonb_build_object(k, '[gizli]');
    ELSIF jsonb_typeof(v) = 'object' THEN
      r := r || jsonb_build_object(k, audit_detay_temizle(v));
    ELSE
      r := r || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  RETURN r;
END
$$;
REVOKE ALL ON FUNCTION audit_detay_temizle(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_detay_temizle(jsonb) TO klinik_uygulama, klinik_sahip;

CREATE OR REPLACE FUNCTION audit_log_yaz() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_klinik_id uuid;
  v_hedef_id uuid;
BEGIN
  v_klinik_id := COALESCE(NEW.klinik_id, OLD.klinik_id);
  v_hedef_id := COALESCE(NEW.id, OLD.id);

  -- Klinik silinirken (CASCADE) klinik satırı artık yok: FK'yi ihlal edecek denetim satırı yazma.
  IF v_klinik_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM klinik WHERE id = v_klinik_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (v_klinik_id, app_kullanici_id(), lower(TG_OP), TG_TABLE_NAME, v_hedef_id, audit_detay_temizle(to_jsonb(COALESCE(NEW, OLD))));

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION audit_log_degisiklik_yaz() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
declare
  v_yeni jsonb := case when tg_op <> 'DELETE' then audit_detay_temizle(to_jsonb(new)) end;
  v_eski jsonb := case when tg_op <> 'INSERT' then audit_detay_temizle(to_jsonb(old)) end;
  v_ham_yeni jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ham_eski jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_satir jsonb := coalesce(v_ham_yeni, v_ham_eski);
  v_sadece_alan_adi boolean := coalesce(tg_argv[0], '') = 'sadece_alan_adi';
  v_klinik_id uuid;
  v_hedef_id uuid;
  v_degisen text[];
  v_detay jsonb;
begin
  begin
    v_klinik_id := (v_satir ->> 'klinik_id')::uuid;
    -- hasta_hassas'ın PK'sı id değil hasta_id
    v_hedef_id := coalesce(v_satir ->> 'id', v_satir ->> 'hasta_id')::uuid;

    if v_klinik_id is null or not exists (select 1 from klinik where id = v_klinik_id) then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE' then
      -- "değişti mi" karşılaştırması HAM değerlerle (temizlenmiş '[gizli]' iki taraf için eşit görünürdü)
      select coalesce(array_agg(k order by k), '{}')
        into v_degisen
        from jsonb_object_keys(v_ham_yeni) as k
       where k <> 'updated_at' and (v_ham_yeni -> k) is distinct from (v_ham_eski -> k);

      if coalesce(array_length(v_degisen, 1), 0) = 0 then
        return new;
      end if;

      -- hasta.risk_bayraklari zaten eski trg_musteri_risk_audit ile kaydediliyor
      if tg_table_name = 'hasta' and v_degisen = array['risk_bayraklari'] then
        return new;
      end if;

      v_detay := jsonb_build_object('surum', 2, 'degisen_alanlar', to_jsonb(v_degisen));
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object(
          'eski', (select jsonb_object_agg(k, v_eski -> k) from unnest(v_degisen) as k),
          'yeni', (select jsonb_object_agg(k, v_yeni -> k) from unnest(v_degisen) as k)
        );
      end if;
    elsif tg_op = 'INSERT' then
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('yeni', v_yeni);
      end if;
    else
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('eski', v_eski);
      end if;
    end if;

    -- UPDATE'te yalnız değişen alanlar tutulduğundan satırın hangi hastaya ait olduğu kaybolmasın — bağlam alanı olarak her zaman eklenir.
    if v_satir ->> 'hasta_id' is not null then
      v_detay := v_detay || jsonb_build_object('hasta_id', v_satir ->> 'hasta_id');
    end if;

    insert into audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
    values (v_klinik_id, app_kullanici_id(), lower(tg_op), tg_table_name, v_hedef_id, v_detay);
  exception when others then
    raise warning 'audit_log_degisiklik_yaz hatası (% %): %', tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;
