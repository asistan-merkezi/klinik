-- Personel Detay'a 3. modül: Çalışma Çizelgesi (puantaj). Görev tarifindeki
-- vardiya_turu ve terapist_izin tabloları CLAUDE.md'de tanımlıydı ama HİÇBİR
-- migration'da CREATE edilmemişti (information_schema + canlı REST API ile
-- doğrulandı, ikisi de yoktu) — bu migration'da ilk kez, sadece puantajın
-- ihtiyaç duyduğu minimal alanlarla oluşturuluyorlar (randevu-çakışma DB
-- kısıtı gibi CLAUDE.md'nin bahsettiği ama bu görevin kapsamı dışındaki
-- parçalar eklenmedi — kullanıcı onayıyla).
--
-- Kapsam kararları (kullanıcı onayıyla):
-- - personel_puantaj.not → SQL'de ayrılmış kelime olduğu için not_metni olarak
--   adlandırıldı (aynı anlam, çakışma yok).
-- - haftanin_gunu: Postgres EXTRACT(DOW) ile birebir (0=Pazar...6=Cumartesi) —
--   yeni bir haftaiçi eşleme icat edilmedi, UI gün seçici bununla eşleşmeli.
-- - FM→₺ dönüşümü: hiçbir yerde saatlik ücret kavramı yok (maasHesapla tamamen
--   seans-sayısı/sabit bonus bazlı). personel'e opsiyonel fm_saatlik_ucret
--   eklendi; doluysa dönem kapanışında otomatik hesaplanır, boşsa satır yine
--   açılır ama tutar=0 + "elle güncelle" notuyla (asla uydurma rakam yazılmaz).
-- - Eksik çalışma (snapshot_eksik_saat) sadece bilgi amaçlı saklanır/gösterilir
--   — personel_ekstra_hakedis.tutar her zaman >=0 (sadece hakediş ekliyor,
--   maasHesapla çıkarma yapmıyor), bu yüzden gerçek bir "kesinti" satırı/
--   mekanizması AÇILMADI; bordro formülüne dokunulmadı.
-- - "Dönem kapatıldığında ... hakediş satırı yazılsın" atomik + idempotent
--   olması gerektiği için (odeme_olustur/randevu_gelis_isaretle ile aynı
--   SECURITY DEFINER RPC deseni) personel_puantaj_donem'e DOĞRUDAN
--   INSERT/UPDATE policy'si YOK — sadece personel_puantaj_donem_kapat/
--   _yeniden_ac RPC'leri üzerinden yazılabiliyor.
-- - fm_onaylayan_id/fm_onay_tarihi client'tan gelen değere güvenilmeden,
--   trigger'la sunucu session'ından türetiliyor (personel_hassas/kisisel_bilgi
--   onay denetimi trigger'larıyla aynı "kim onayladı alanı spoof edilemez"
--   deseni — klinik_admin plain UPDATE ile başka bir admin'i onaylayan
--   gösteremesin diye).
-- - HARD DELETE YOK: yeni 4 tablonun hiçbirine DELETE policy'si açılmadı
--   (varsayılan RLS deny). vardiya_turu FOR ALL admin'e açık (oda/cihaz
--   katalog deseniyle aynı) ama personel_vardiya_atama'da FK RESTRICT zaten
--   kullanımdaki bir vardiya_turu'nün silinmesini engelliyor.

-- ============================================================
-- 0) vardiya_turu — vardiya şablonları (CLAUDE.md'de tanımlıydı, ilk kez burada CREATE ediliyor)
-- ============================================================
CREATE TABLE IF NOT EXISTS vardiya_turu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  baslangic_saat time NOT NULL,
  bitis_saat time NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vardiya_turu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vardiya_turu_klinik_id ON vardiya_turu(klinik_id);

DROP TRIGGER IF EXISTS trg_vardiya_turu_updated_at ON vardiya_turu;
CREATE TRIGGER trg_vardiya_turu_updated_at
  BEFORE UPDATE ON vardiya_turu FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP POLICY IF EXISTS "vardiya_turu_select" ON vardiya_turu;
CREATE POLICY "vardiya_turu_select" ON vardiya_turu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "vardiya_turu_yonet_admin" ON vardiya_turu;
CREATE POLICY "vardiya_turu_yonet_admin" ON vardiya_turu
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ============================================================
-- 1) terapist_izin — terapist izin/vardiya dışı saatleri (CLAUDE.md'de tanımlıydı,
--    ilk kez burada CREATE ediliyor; sadece puantaj otomatik-doldurma için
--    yeterli minimal onay akışı — randevu-çakışma DB kısıtı bu turda YOK)
-- ============================================================
CREATE TABLE IF NOT EXISTS terapist_izin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  terapist_id uuid NOT NULL REFERENCES terapist(id) ON DELETE CASCADE,
  izin_turu text NOT NULL CHECK (izin_turu IN ('yillik', 'hastalik', 'mazeret', 'egitim')),
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  onay_durumu text NOT NULL DEFAULT 'bekliyor' CHECK (onay_durumu IN ('bekliyor', 'onaylandi', 'reddedildi')),
  onaylayan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  onay_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terapist_izin_aralik_gecerli CHECK (bitis > baslangic)
);
ALTER TABLE terapist_izin ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_terapist_izin_klinik_id ON terapist_izin(klinik_id);
CREATE INDEX IF NOT EXISTS idx_terapist_izin_terapist_id ON terapist_izin(terapist_id);

DROP TRIGGER IF EXISTS trg_terapist_izin_klinik_id ON terapist_izin;
CREATE TRIGGER trg_terapist_izin_klinik_id
  BEFORE INSERT ON terapist_izin
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('terapist', 'terapist_id');

DROP TRIGGER IF EXISTS trg_terapist_izin_updated_at ON terapist_izin;
CREATE TRIGGER trg_terapist_izin_updated_at
  BEFORE UPDATE ON terapist_izin FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_terapist_izin_audit ON terapist_izin;
CREATE TRIGGER trg_terapist_izin_audit
  AFTER INSERT OR UPDATE OR DELETE ON terapist_izin
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "terapist_izin_select" ON terapist_izin;
CREATE POLICY "terapist_izin_select" ON terapist_izin
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR EXISTS (
      SELECT 1 FROM terapist t JOIN personel p ON p.id = t.personel_id
      WHERE t.id = terapist_izin.terapist_id AND p.kullanici_id = auth.uid()
    )
    OR is_super_admin()
  );

-- Terapist kendi izin talebini oluşturabilir ama SADECE 'bekliyor' durumuyla
-- (kendi kendini onaylayamaz); admin doğrudan onaylı da girebilir.
DROP POLICY IF EXISTS "terapist_izin_talep_kendi" ON terapist_izin;
CREATE POLICY "terapist_izin_talep_kendi" ON terapist_izin
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR (
      klinik_id = current_klinik_id() AND onay_durumu = 'bekliyor' AND EXISTS (
        SELECT 1 FROM terapist t JOIN personel p ON p.id = t.personel_id
        WHERE t.id = terapist_izin.terapist_id AND p.kullanici_id = auth.uid()
      )
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "terapist_izin_onayla_admin" ON terapist_izin;
CREATE POLICY "terapist_izin_onayla_admin" ON terapist_izin
  FOR UPDATE USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ============================================================
-- 2) personel_vardiya_atama — planlanan saatin tek kaynağı
-- ============================================================
CREATE TABLE IF NOT EXISTS personel_vardiya_atama (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  vardiya_turu_id uuid NOT NULL REFERENCES vardiya_turu(id) ON DELETE RESTRICT,
  haftanin_gunu smallint NOT NULL CHECK (haftanin_gunu BETWEEN 0 AND 6),
  gecerlilik_baslangic date NOT NULL DEFAULT current_date,
  gecerlilik_bitis date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personel_vardiya_atama_aralik_gecerli
    CHECK (gecerlilik_bitis IS NULL OR gecerlilik_bitis >= gecerlilik_baslangic)
);
ALTER TABLE personel_vardiya_atama ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_vardiya_atama_klinik_id ON personel_vardiya_atama(klinik_id);
CREATE INDEX IF NOT EXISTS idx_personel_vardiya_atama_personel_id ON personel_vardiya_atama(personel_id);

-- Aynı personel + aynı haftanın günü için tarih aralığı çakışan iki atama
-- olamaz (randevu'daki oda+terapist+cihaz exclusion constraint deseniyle
-- aynı fikir — "hangi atama geçerli" belirsizliğini DB seviyesinde engeller).
-- ADD CONSTRAINT'te IF NOT EXISTS olmadığı için migration'ı idempotent tutmak
-- adına varlık kontrolü DO bloğuyla yapılıyor.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personel_vardiya_atama_cakisma_yok'
  ) THEN
    ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_cakisma_yok
      EXCLUDE USING gist (
        personel_id WITH =,
        haftanin_gunu WITH =,
        daterange(gecerlilik_baslangic, gecerlilik_bitis, '[]') WITH &&
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_personel_vardiya_atama_klinik_id ON personel_vardiya_atama;
CREATE TRIGGER trg_personel_vardiya_atama_klinik_id
  BEFORE INSERT ON personel_vardiya_atama
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');

DROP TRIGGER IF EXISTS trg_personel_vardiya_atama_updated_at ON personel_vardiya_atama;
CREATE TRIGGER trg_personel_vardiya_atama_updated_at
  BEFORE UPDATE ON personel_vardiya_atama FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personel_vardiya_atama_audit ON personel_vardiya_atama;
CREATE TRIGGER trg_personel_vardiya_atama_audit
  AFTER INSERT OR UPDATE OR DELETE ON personel_vardiya_atama
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

-- resepsiyon varsayılan olarak göremez, klinik_ayarlar.ayarlar->>'resepsiyon_puantaj_gorebilir'
-- ile açılabilir (henüz Ayarlar ekranında bir toggle yok — kullanıcı isteği
-- "klinik_ayarlar ile açılabilir" demişti, alan hazır bekliyor).
CREATE OR REPLACE FUNCTION resepsiyon_puantaj_gorebilir_mi()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT (ayarlar ->> 'resepsiyon_puantaj_gorebilir')::boolean FROM klinik_ayarlar WHERE klinik_id = current_klinik_id()),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "personel_vardiya_atama_select" ON personel_vardiya_atama;
CREATE POLICY "personel_vardiya_atama_select" ON personel_vardiya_atama
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR (klinik_id = current_klinik_id() AND current_rol() = 'resepsiyon' AND resepsiyon_puantaj_gorebilir_mi())
    OR EXISTS (SELECT 1 FROM personel p WHERE p.id = personel_vardiya_atama.personel_id AND p.kullanici_id = auth.uid())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_vardiya_atama_ekle_admin" ON personel_vardiya_atama;
CREATE POLICY "personel_vardiya_atama_ekle_admin" ON personel_vardiya_atama
  FOR INSERT WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "personel_vardiya_atama_guncelle_admin" ON personel_vardiya_atama;
CREATE POLICY "personel_vardiya_atama_guncelle_admin" ON personel_vardiya_atama
  FOR UPDATE USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Belirli bir personel+tarih için o an geçerli atamayı (varsa) döndürür.
-- haftanin_gunu: Postgres EXTRACT(DOW) ile birebir (0=Pazar...6=Cumartesi).
CREATE OR REPLACE FUNCTION personel_puantaj_planlanan_getir(p_personel_id uuid, p_tarih date)
RETURNS TABLE(vardiya_turu_id uuid, baslangic time, bitis time) AS $$
  SELECT pva.vardiya_turu_id, vt.baslangic_saat, vt.bitis_saat
  FROM personel_vardiya_atama pva
  JOIN vardiya_turu vt ON vt.id = pva.vardiya_turu_id
  WHERE pva.personel_id = p_personel_id
    AND pva.haftanin_gunu = EXTRACT(DOW FROM p_tarih)::smallint
    AND pva.gecerlilik_baslangic <= p_tarih
    AND (pva.gecerlilik_bitis IS NULL OR pva.gecerlilik_bitis >= p_tarih)
  ORDER BY pva.gecerlilik_baslangic DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3) personel_puantaj — gün bazlı puantaj kaydı
-- ============================================================

-- net/sapma/fm/eksik dakika hesapları: Postgres GENERATED kolonlar birbirini
-- REFERANS ALAMADIĞI için (sadece "gerçek" kolonları), her biri bu iki IMMUTABLE
-- yardımcı fonksiyonu tekrar çağırıyor — kod tekrarı yerine fonksiyon paylaşımı.
CREATE OR REPLACE FUNCTION personel_puantaj_net_dakika(p_giris timestamptz, p_cikis timestamptz, p_mola integer)
RETURNS integer AS $$
  SELECT CASE
    WHEN p_giris IS NULL OR p_cikis IS NULL THEN NULL
    ELSE GREATEST(0, (EXTRACT(EPOCH FROM (p_cikis - p_giris)) / 60)::int - COALESCE(p_mola, 0))
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION personel_puantaj_planlanan_dakika(p_baslangic time, p_bitis time)
RETURNS integer AS $$
  SELECT CASE
    WHEN p_baslangic IS NULL OR p_bitis IS NULL THEN NULL
    ELSE (EXTRACT(EPOCH FROM (p_bitis - p_baslangic)) / 60)::int
      + CASE WHEN p_bitis < p_baslangic THEN 1440 ELSE 0 END -- gece vardiyası (örn. 22:00-06:00) sarması
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION personel_puantaj_sapma_dakika(
  p_giris timestamptz, p_cikis timestamptz, p_mola integer, p_planlanan_baslangic time, p_planlanan_bitis time
) RETURNS integer AS $$
  SELECT personel_puantaj_net_dakika(p_giris, p_cikis, p_mola)
       - personel_puantaj_planlanan_dakika(p_planlanan_baslangic, p_planlanan_bitis);
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS personel_puantaj (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  tarih date NOT NULL,
  planlanan_baslangic time,
  planlanan_bitis time,
  giris_saat timestamptz,
  cikis_saat timestamptz,
  mola_dakika integer NOT NULL DEFAULT 0 CHECK (mola_dakika >= 0),
  net_calisma_dakika integer GENERATED ALWAYS AS (
    personel_puantaj_net_dakika(giris_saat, cikis_saat, mola_dakika)
  ) STORED,
  sapma_dakika integer GENERATED ALWAYS AS (
    personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis)
  ) STORED,
  fazla_mesai_dakika integer GENERATED ALWAYS AS (
    CASE WHEN personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL THEN NULL
      ELSE GREATEST(personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis), 0) END
  ) STORED,
  eksik_calisma_dakika integer GENERATED ALWAYS AS (
    CASE WHEN personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL THEN NULL
      ELSE GREATEST(-personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis), 0) END
  ) STORED,
  fm_onay_durumu text NOT NULL DEFAULT 'bekliyor' CHECK (fm_onay_durumu IN ('bekliyor', 'onaylandi', 'reddedildi')),
  fm_onaylayan_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  fm_onay_tarihi timestamptz,
  durum text NOT NULL CHECK (durum IN ('calisti', 'izinli', 'raporlu', 'gelmedi', 'resmi_tatil')),
  kaynak text NOT NULL DEFAULT 'manuel' CHECK (kaynak IN ('manuel', 'tablet')),
  not_metni text, -- spec'teki "not": SQL'de ayrılmış kelime olduğu için yeniden adlandırıldı
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personel_id, tarih),
  CONSTRAINT personel_puantaj_cikis_giristen_sonra CHECK (cikis_saat IS NULL OR giris_saat IS NULL OR cikis_saat > giris_saat)
);
ALTER TABLE personel_puantaj ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_puantaj_klinik_id ON personel_puantaj(klinik_id);
CREATE INDEX IF NOT EXISTS idx_personel_puantaj_personel_id ON personel_puantaj(personel_id);
CREATE INDEX IF NOT EXISTS idx_personel_puantaj_tarih ON personel_puantaj(tarih);

DROP TRIGGER IF EXISTS trg_personel_puantaj_klinik_id ON personel_puantaj;
CREATE TRIGGER trg_personel_puantaj_klinik_id
  BEFORE INSERT ON personel_puantaj
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');

-- planlanan_baslangic/bitis atamadan SNAPSHOT alınır (sadece INSERT anında —
-- sonradan atama değişse bile geçmiş puantaj kayıtları sabit kalır, güncelleme
-- her zaman elle yapılabilir). mola_dakika boşsa klinik_ayarlar.ayarlar->>
-- 'varsayilan_mola_dk''dan (henüz Ayarlar ekranında bir alanı yok, ayarlar
-- JSONB'sinde manuel set edilebilir; hiç ayarlanmamışsa 0 dakika). durum
-- boş bırakılırsa (client "otomatik tespit et" istiyorsa) o tarihte
-- ONAYLANMIŞ bir terapist_izin varsa 'raporlu'/'izinli', yoksa 'calisti' olur
-- — kullanıcı isteği: "izinli/raporlu terapist_izin'den otomatik doldurulur,
-- puantaj ekranından ayrıca izin kaydı OLUŞTURULMAZ".
CREATE OR REPLACE FUNCTION personel_puantaj_varsayilanlari_doldur()
RETURNS trigger AS $$
DECLARE
  v_plan record;
  v_mola_varsayilan integer;
  v_izin_turu text;
BEGIN
  IF NEW.planlanan_baslangic IS NULL AND NEW.planlanan_bitis IS NULL THEN
    SELECT * INTO v_plan FROM personel_puantaj_planlanan_getir(NEW.personel_id, NEW.tarih);
    IF FOUND THEN
      NEW.planlanan_baslangic := v_plan.baslangic;
      NEW.planlanan_bitis := v_plan.bitis;
    END IF;
  END IF;

  IF NEW.mola_dakika IS NULL THEN
    SELECT (ayarlar ->> 'varsayilan_mola_dk')::int INTO v_mola_varsayilan
    FROM klinik_ayarlar WHERE klinik_id = NEW.klinik_id;
    NEW.mola_dakika := COALESCE(v_mola_varsayilan, 0);
  END IF;

  IF NEW.durum IS NULL THEN
    SELECT ti.izin_turu INTO v_izin_turu
    FROM terapist_izin ti
    JOIN terapist t ON t.id = ti.terapist_id
    WHERE t.personel_id = NEW.personel_id
      AND ti.onay_durumu = 'onaylandi'
      AND ti.baslangic::date <= NEW.tarih
      AND ti.bitis::date >= NEW.tarih
    LIMIT 1;

    IF FOUND THEN
      NEW.durum := CASE WHEN v_izin_turu = 'hastalik' THEN 'raporlu' ELSE 'izinli' END;
    ELSE
      NEW.durum := 'calisti';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_personel_puantaj_varsayilanlar ON personel_puantaj;
CREATE TRIGGER trg_personel_puantaj_varsayilanlar
  BEFORE INSERT ON personel_puantaj
  FOR EACH ROW EXECUTE FUNCTION personel_puantaj_varsayilanlari_doldur();

-- fm_onaylayan_id/fm_onay_tarihi client'tan gelen değere hiç güvenilmiyor —
-- fm_onay_durumu değiştiğinde sunucu session'ından otomatik türetiliyor
-- (personel_hassas/kisisel_bilgi_formu onay denetimi trigger'larıyla aynı
-- "spoof edilemez onaylayan" deseni).
CREATE OR REPLACE FUNCTION personel_puantaj_fm_onay_denetim()
RETURNS trigger AS $$
BEGIN
  IF NEW.fm_onay_durumu IS DISTINCT FROM OLD.fm_onay_durumu THEN
    IF NEW.fm_onay_durumu IN ('onaylandi', 'reddedildi') THEN
      NEW.fm_onaylayan_id := auth.uid();
      NEW.fm_onay_tarihi := now();
    ELSE
      NEW.fm_onaylayan_id := NULL;
      NEW.fm_onay_tarihi := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_personel_puantaj_fm_onay_denetim ON personel_puantaj;
CREATE TRIGGER trg_personel_puantaj_fm_onay_denetim
  BEFORE UPDATE ON personel_puantaj
  FOR EACH ROW EXECUTE FUNCTION personel_puantaj_fm_onay_denetim();

DROP TRIGGER IF EXISTS trg_personel_puantaj_updated_at ON personel_puantaj;
CREATE TRIGGER trg_personel_puantaj_updated_at
  BEFORE UPDATE ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personel_puantaj_audit ON personel_puantaj;
CREATE TRIGGER trg_personel_puantaj_audit
  AFTER INSERT OR UPDATE OR DELETE ON personel_puantaj
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

-- Dönem kapalıyken bu personel+ay için UPDATE/yeni INSERT engellenir (RLS
-- seviyesinde — kullanıcı isteği: "Dönemi yeniden aç" ayrı bir klinik_admin
-- aksiyonu). Bu kısıt admin dahil HERKESE uygulanıyor (süper_admin hariç) —
-- kapanışın anlamı zaten bu.
CREATE OR REPLACE FUNCTION personel_puantaj_donemi_acik_mi(p_personel_id uuid, p_tarih date)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM personel_puantaj_donem d
    WHERE d.personel_id = p_personel_id
      AND d.yil = EXTRACT(YEAR FROM p_tarih)::int
      AND d.ay = EXTRACT(MONTH FROM p_tarih)::int
      AND d.durum = 'kapali'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "personel_puantaj_select" ON personel_puantaj;
CREATE POLICY "personel_puantaj_select" ON personel_puantaj
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR (klinik_id = current_klinik_id() AND current_rol() = 'resepsiyon' AND resepsiyon_puantaj_gorebilir_mi())
    OR EXISTS (SELECT 1 FROM personel p WHERE p.id = personel_puantaj.personel_id AND p.kullanici_id = auth.uid())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_puantaj_ekle_admin" ON personel_puantaj;
CREATE POLICY "personel_puantaj_ekle_admin" ON personel_puantaj
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin' AND personel_puantaj_donemi_acik_mi(personel_id, tarih))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_puantaj_guncelle_admin" ON personel_puantaj;
CREATE POLICY "personel_puantaj_guncelle_admin" ON personel_puantaj
  FOR UPDATE USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin' AND personel_puantaj_donemi_acik_mi(personel_id, tarih))
    OR is_super_admin()
  );

-- ============================================================
-- 4) personel_puantaj_donem — aylık kapanış snapshot'ı
-- ============================================================
CREATE TABLE IF NOT EXISTS personel_puantaj_donem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  yil integer NOT NULL CHECK (yil BETWEEN 2020 AND 2100),
  ay integer NOT NULL CHECK (ay BETWEEN 1 AND 12),
  durum text NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'kapali')),
  snapshot_net_saat numeric(8, 2),
  snapshot_onayli_fm_saat numeric(8, 2),
  snapshot_eksik_saat numeric(8, 2),
  snapshot_izin_gun integer,
  snapshot_devamsizlik_gun integer,
  kapatan_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  kapatma_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personel_id, yil, ay)
);
ALTER TABLE personel_puantaj_donem ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_puantaj_donem_klinik_id ON personel_puantaj_donem(klinik_id);

DROP TRIGGER IF EXISTS trg_personel_puantaj_donem_klinik_id ON personel_puantaj_donem;
CREATE TRIGGER trg_personel_puantaj_donem_klinik_id
  BEFORE INSERT ON personel_puantaj_donem
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');

DROP TRIGGER IF EXISTS trg_personel_puantaj_donem_updated_at ON personel_puantaj_donem;
CREATE TRIGGER trg_personel_puantaj_donem_updated_at
  BEFORE UPDATE ON personel_puantaj_donem FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_personel_puantaj_donem_audit ON personel_puantaj_donem;
CREATE TRIGGER trg_personel_puantaj_donem_audit
  AFTER INSERT OR UPDATE OR DELETE ON personel_puantaj_donem
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

-- Sadece SELECT policy'si var — INSERT/UPDATE hiç açılmıyor, yazma SADECE
-- aşağıdaki personel_puantaj_donem_kapat/_yeniden_ac RPC'leri üzerinden
-- (odeme_olustur/randevu_gelis_isaretle ile aynı desen: çok-tablolu atomik
-- yazım + manuel yetki kontrolü SECURITY DEFINER fonksiyonda).
DROP POLICY IF EXISTS "personel_puantaj_donem_select" ON personel_puantaj_donem;
CREATE POLICY "personel_puantaj_donem_select" ON personel_puantaj_donem
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR (klinik_id = current_klinik_id() AND current_rol() = 'resepsiyon' AND resepsiyon_puantaj_gorebilir_mi())
    OR EXISTS (SELECT 1 FROM personel p WHERE p.id = personel_puantaj_donem.personel_id AND p.kullanici_id = auth.uid())
    OR is_super_admin()
  );

-- ============================================================
-- 5) Bordro entegrasyonu: personel.fm_saatlik_ucret + personel_ekstra_hakedis.puantaj_donem_id
-- ============================================================
ALTER TABLE personel ADD COLUMN IF NOT EXISTS fm_saatlik_ucret numeric(10, 2) CHECK (fm_saatlik_ucret IS NULL OR fm_saatlik_ucret >= 0);

-- Dönem kapanışında otomatik açılan 'mesai' hakediş satırını izler; yeniden
-- kapatmada AYNI dönem için ikinci bir satır açılmasını engeller (idempotency
-- — randevu_gelis_isaretle'deki "zaten_islendi" kontrolüyle aynı fikir, burada
-- DB seviyesinde partial unique index ile garanti ediliyor).
ALTER TABLE personel_ekstra_hakedis ADD COLUMN IF NOT EXISTS puantaj_donem_id uuid REFERENCES personel_puantaj_donem(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_personel_ekstra_hakedis_puantaj_donem_id
  ON personel_ekstra_hakedis(puantaj_donem_id) WHERE puantaj_donem_id IS NOT NULL;

-- personel_puantaj_donem_kapat: dönemi hesaplar+dondurur+kapatır ve (varsa)
-- onaylı FM'i bordroya (personel_ekstra_hakedis, tur='mesai') yazar. Eksik
-- çalışma saati kasıtlı olarak bordroya YAZILMIYOR (personel_ekstra_hakedis.
-- tutar>=0 kısıtı + maasHesapla'da hiç kesinti mekanizması yok — kullanıcı
-- kararıyla sadece snapshot_eksik_saat üzerinden bilgi amaçlı gösteriliyor).
CREATE OR REPLACE FUNCTION personel_puantaj_donem_kapat(p_personel_id uuid, p_yil integer, p_ay integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_klinik_id uuid;
  v_personel personel%ROWTYPE;
  v_ay_baslangic date;
  v_ay_bitis date;
  v_net_dk numeric;
  v_fm_dk numeric;
  v_eksik_dk numeric;
  v_izin_gun integer;
  v_devamsizlik_gun integer;
  v_donem_id uuid;
  v_fm_saat numeric;
  v_hakedis_tutar numeric;
BEGIN
  v_klinik_id := current_klinik_id();
  IF NOT (current_rol() = 'klinik_admin' OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id AND (klinik_id = v_klinik_id OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  IF EXISTS (
    SELECT 1 FROM personel_puantaj_donem
    WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay AND durum = 'kapali'
  ) THEN
    RAISE EXCEPTION 'donem_zaten_kapali';
  END IF;

  v_ay_baslangic := make_date(p_yil, p_ay, 1);
  v_ay_bitis := (v_ay_baslangic + interval '1 month')::date;

  SELECT
    COALESCE(SUM(net_calisma_dakika), 0),
    COALESCE(SUM(fazla_mesai_dakika) FILTER (WHERE fm_onay_durumu = 'onaylandi'), 0),
    COALESCE(SUM(eksik_calisma_dakika), 0),
    COUNT(*) FILTER (WHERE durum IN ('izinli', 'raporlu')),
    COUNT(*) FILTER (WHERE durum = 'gelmedi')
  INTO v_net_dk, v_fm_dk, v_eksik_dk, v_izin_gun, v_devamsizlik_gun
  FROM personel_puantaj
  WHERE personel_id = p_personel_id AND tarih >= v_ay_baslangic AND tarih < v_ay_bitis;

  INSERT INTO personel_puantaj_donem (
    klinik_id, personel_id, yil, ay, durum,
    snapshot_net_saat, snapshot_onayli_fm_saat, snapshot_eksik_saat,
    snapshot_izin_gun, snapshot_devamsizlik_gun, kapatan_id, kapatma_tarihi
  ) VALUES (
    v_klinik_id, p_personel_id, p_yil, p_ay, 'kapali',
    round(v_net_dk / 60.0, 2), round(v_fm_dk / 60.0, 2), round(v_eksik_dk / 60.0, 2),
    v_izin_gun, v_devamsizlik_gun, auth.uid(), now()
  )
  ON CONFLICT (personel_id, yil, ay) DO UPDATE SET
    durum = 'kapali',
    snapshot_net_saat = EXCLUDED.snapshot_net_saat,
    snapshot_onayli_fm_saat = EXCLUDED.snapshot_onayli_fm_saat,
    snapshot_eksik_saat = EXCLUDED.snapshot_eksik_saat,
    snapshot_izin_gun = EXCLUDED.snapshot_izin_gun,
    snapshot_devamsizlik_gun = EXCLUDED.snapshot_devamsizlik_gun,
    kapatan_id = EXCLUDED.kapatan_id,
    kapatma_tarihi = EXCLUDED.kapatma_tarihi
  RETURNING id INTO v_donem_id;

  v_fm_saat := round(v_fm_dk / 60.0, 2);

  IF v_fm_saat > 0 AND NOT EXISTS (SELECT 1 FROM personel_ekstra_hakedis WHERE puantaj_donem_id = v_donem_id) THEN
    v_hakedis_tutar := COALESCE(v_personel.fm_saatlik_ucret, 0) * v_fm_saat;

    INSERT INTO personel_ekstra_hakedis (
      klinik_id, personel_id, tur, tutar, tarih, aciklama, ekleyen_kullanici_id, puantaj_donem_id
    ) VALUES (
      v_klinik_id, p_personel_id, 'mesai', v_hakedis_tutar, (v_ay_bitis - 1),
      format(
        '%s/%s dönemi onaylı fazla mesai: %s sa%s', p_ay, p_yil, v_fm_saat,
        CASE WHEN v_personel.fm_saatlik_ucret IS NULL
          THEN ' — saatlik ücret tanımlı değil, tutar elle güncellenmeli'
          ELSE '' END
      ),
      auth.uid(), v_donem_id
    );
  END IF;

  RETURN jsonb_build_object(
    'donem_id', v_donem_id,
    'net_saat', round(v_net_dk / 60.0, 2),
    'onayli_fm_saat', v_fm_saat,
    'eksik_saat', round(v_eksik_dk / 60.0, 2),
    'izin_gun', v_izin_gun,
    'devamsizlik_gun', v_devamsizlik_gun
  );
END;
$function$;

REVOKE ALL ON FUNCTION personel_puantaj_donem_kapat(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_donem_kapat(uuid, integer, integer) TO authenticated;

-- personel_puantaj_donem_yeniden_ac: sadece durumu 'acik'a döndürür. Daha önce
-- otomatik açılmış personel_ekstra_hakedis satırı SİLİNMEZ (ledger'lar bu
-- projede hiç güncellenmez/silinmez felsefesiyle tutarlı) — veri düzeltilip
-- tekrar kapatılırsa idempotency kontrolü nedeniyle YENİ bir satır açılmaz,
-- admin ilk satırı elle düzeltmeli. Bilinen/kabul edilen kısıt.
CREATE OR REPLACE FUNCTION personel_puantaj_donem_yeniden_ac(p_personel_id uuid, p_yil integer, p_ay integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT (current_rol() = 'klinik_admin' OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE personel_puantaj_donem
  SET durum = 'acik', kapatan_id = NULL, kapatma_tarihi = NULL
  WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay
    AND klinik_id = current_klinik_id()
    AND durum = 'kapali';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'donem_bulunamadi_veya_zaten_acik';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION personel_puantaj_donem_yeniden_ac(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_donem_yeniden_ac(uuid, integer, integer) TO authenticated;

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN
--   ('vardiya_turu','terapist_izin','personel_vardiya_atama','personel_puantaj','personel_puantaj_donem');
-- SELECT proname FROM pg_proc WHERE proname LIKE 'personel_puantaj%';
