-- Cihaz rezervasyonu ADIM BAZLI süreyle sınırlanır (kullanıcı canlıya uyguladı, 2026-09-30).
--
-- Sorun: randevu_cihaz_cakisma (20260726083923) cihazı randevunun TÜM süresi
-- boyunca kilitliyordu (60 dk'lık seansta 20 dk ultrason için 60 dk bloke) ve
-- islem_tanimi_adim.gerekli_cihaz_id çakışma kontrolüne hiç girmiyordu
-- (randevu.cihaz_id formdan elle seçilen, bağımsız bir alandı).
--
-- Çözüm: çakışma kısıtı yeni `randevu_cihaz_rezervasyon` tablosuna taşınır.
-- Satırlar randevu üzerindeki bir TRIGGER ile türetilir:
--   * 'adim'   — tedavinin adımları `sira` sırasıyla randevu.baslangic'ten
--                kümülatif olarak dizilir; gerekli_cihaz_id'si dolu her adım,
--                kendi [başlangıç, başlangıç+sure_dakika) penceresini kilitler.
--   * 'manuel' — YALNIZ geri uyum: tedavi tanımında cihazlı adım yoksa ve
--                randevu.cihaz_id (eski elle seçim) doluysa eski davranış
--                korunur (tüm süre kilitli). Tanımda cihaz varsa tanım esastır.
--
-- KAYNAK: cihaz penceresinin tek doğruluk kaynağı TEDAVİ TANIMINDAKİ adımlar
-- (sira, gerekli_cihaz_id, sure_dakika) — randevu anında girilen cihaz/süre
-- değil.
--
-- NEDEN TRIGGER (RPC DEĞİL): randevu yazan yerler (randevuOlustur/Guncelle/
-- Ertele, periyodik üretim, hasta detayı, arşiv içe aktarma) doğrudan PostgREST
-- insert/update yapıyor — hepsini RPC'ye taşımak geniş bir refactor olurdu.
-- Trigger içindeki exclusion ihlali istemciye AYNI 23P01 koduyla döner, yani
-- mevcut hata yakalama ("...cihaz bu saatte dolu", periyodik gün atlama)
-- değişmeden çalışır; yazma yine tek transaction'da atomik.
--
-- SNAPSHOT: rezervasyonlar randevu oluşurken/zamanı değişirken o günkü tedavi
-- tanımından üretilir. Tedavi adımları sonradan değişse mevcut randevuların
-- pencereleri KAYMAZ — trigger yalnız baslangic/bitis/islem_tanimi_id/
-- cihaz_id/aktiflik (iptal-gelmedi dışı mı) değişince yeniden üretir; salt
-- durum geçişleri (geldi, seansta, tamamlandi...) dokunmaz.
--
-- KARARLAR:
--   * Gecikmeli check-in pencereleri KAYDIRMAZ (planlanan pencere tampon).
--   * Pencereler tanımdaki süreden hesaplanır; randevu formunda elle
--     değiştirilen süre pencereyi kırpmaz/uzatmaz (adım toplamı randevu
--     süresinden uzunsa cihaz randevu bitişinden sonra da kilitli kalabilir).
--   * sure_dakika'sı NULL olan cihazlı adım, muhafazakâr şekilde randevunun
--     kalan süresini kilitler.
--   * kaynak='arsiv' randevularda adım satırı üretilmez (geçmiş veri, çift
--     rezervasyon kontrolü anlamsız; içe aktarma bu yüzden yeni çakışmalara
--     takılmaz) — yalnız manuel cihaz_id eskisi gibi kilitlenir.
--   * Terapist/oda kilidi (randevu_terapist_cakisma/randevu_oda_cakisma)
--     DEĞİŞMEDİ — yalnız cihaz tarafı adım bazlı.

-- ==================== 1) Adım sırasını garanti altına al ====================
-- Pencereler `sira` sırasına bağlı. Mevcut veriyi (olası eşitlikleri) önce
-- 1..n olarak yeniden numaralandır, sonra tekil kıs. DEFERRABLE INITIALLY
-- DEFERRED şart: islem_tanimi_kaydet adımları tek tek UPDATE/INSERT ederek
-- sırayı yeniden yazıyor, satır-satır kontrol geçici çakışmada patlardı.
UPDATE islem_tanimi_adim a
SET sira = s.yeni_sira
FROM (
  SELECT id,
         row_number() OVER (PARTITION BY islem_tanimi_id ORDER BY sira, created_at, id) AS yeni_sira
  FROM islem_tanimi_adim
) s
WHERE a.id = s.id AND a.sira <> s.yeni_sira;

ALTER TABLE islem_tanimi_adim DROP CONSTRAINT IF EXISTS islem_tanimi_adim_sira_tekil;
ALTER TABLE islem_tanimi_adim
  ADD CONSTRAINT islem_tanimi_adim_sira_tekil
  UNIQUE (islem_tanimi_id, sira) DEFERRABLE INITIALLY DEFERRED;

-- ==================== 2) Rezervasyon tablosu ====================
CREATE TABLE IF NOT EXISTS randevu_cihaz_rezervasyon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL REFERENCES randevu(id) ON DELETE CASCADE,
  cihaz_id uuid NOT NULL REFERENCES cihaz(id) ON DELETE CASCADE,
  -- Adım silinse/değişse pencere snapshot olarak kalır (SET NULL).
  adim_id uuid REFERENCES islem_tanimi_adim(id) ON DELETE SET NULL,
  tur text NOT NULL CHECK (tur IN ('adim', 'manuel')),
  baslangic timestamptz NOT NULL,
  bitis timestamptz NOT NULL,
  zaman_araligi tstzrange GENERATED ALWAYS AS (tstzrange(baslangic, bitis, '[)')) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bitis > baslangic),
  CONSTRAINT randevu_cihaz_rezervasyon_cakisma
    EXCLUDE USING gist (cihaz_id WITH =, zaman_araligi WITH &&)
);
CREATE INDEX IF NOT EXISTS idx_randevu_cihaz_rezervasyon_randevu_id ON randevu_cihaz_rezervasyon(randevu_id);
CREATE INDEX IF NOT EXISTS idx_randevu_cihaz_rezervasyon_klinik_id ON randevu_cihaz_rezervasyon(klinik_id);

ALTER TABLE randevu_cihaz_rezervasyon ENABLE ROW LEVEL SECURITY;

-- Yalnız okuma: yazma SADECE aşağıdaki SECURITY DEFINER fonksiyon/trigger ile.
-- INSERT/UPDATE/DELETE policy'si BİLİNÇLİ yok (API'den kimse rezervasyon
-- uyduramaz/silemez).
DROP POLICY IF EXISTS "randevu_cihaz_rezervasyon_select_klinik" ON randevu_cihaz_rezervasyon;
CREATE POLICY "randevu_cihaz_rezervasyon_select_klinik" ON randevu_cihaz_rezervasyon
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

-- ==================== 3) Yeniden üretim fonksiyonu ====================
CREATE OR REPLACE FUNCTION randevu_cihaz_rezervasyon_yenile(p_randevu_id uuid)
RETURNS void AS $$
DECLARE
  v_r randevu%ROWTYPE;
  v_adim record;
  v_imlec timestamptz;
  v_adim_bitis timestamptz;
  v_adim_penceresi_var boolean := false;
BEGIN
  DELETE FROM randevu_cihaz_rezervasyon WHERE randevu_id = p_randevu_id;

  SELECT * INTO v_r FROM randevu WHERE id = p_randevu_id;
  IF NOT FOUND OR v_r.durum IN ('iptal', 'gelmedi') THEN
    RETURN;
  END IF;

  IF v_r.kaynak <> 'arsiv' AND v_r.islem_tanimi_id IS NOT NULL THEN
    v_imlec := v_r.baslangic;

    FOR v_adim IN
      SELECT id, gerekli_cihaz_id, sure_dakika
      FROM islem_tanimi_adim
      WHERE islem_tanimi_id = v_r.islem_tanimi_id
      ORDER BY sira, id
    LOOP
      -- Pencere TEDAVİ TANIMINDAKİ süreden gelir; randevu formunda elle
      -- değiştirilen süre (randevu.bitis) pencereyi kırpmaz/uzatmaz.
      IF v_adim.sure_dakika IS NULL THEN
        -- Tanımda süresi girilmemiş adım: kalan randevu süresini kilitle
        -- (muhafazakâr), sonrası boş kalır.
        v_adim_bitis := GREATEST(v_r.bitis, v_imlec);
      ELSE
        v_adim_bitis := v_imlec + make_interval(mins => v_adim.sure_dakika);
      END IF;

      IF v_adim.gerekli_cihaz_id IS NOT NULL AND v_imlec < v_adim_bitis THEN
        INSERT INTO randevu_cihaz_rezervasyon (klinik_id, randevu_id, cihaz_id, adim_id, tur, baslangic, bitis)
        VALUES (v_r.klinik_id, v_r.id, v_adim.gerekli_cihaz_id, v_adim.id, 'adim', v_imlec, v_adim_bitis);
        v_adim_penceresi_var := true;
      END IF;

      v_imlec := v_adim_bitis;
    END LOOP;
  END IF;

  -- Elle seçilen cihaz (randevu.cihaz_id) yalnız GERİ UYUM içindir: tedavi
  -- tanımında cihazlı adım yoksa (eski tedaviler, tedavisiz randevu, arşiv)
  -- eski davranış korunur. Tanımda cihaz varsa tanım esastır, elle seçim
  -- rezervasyon üretmez.
  IF v_r.cihaz_id IS NOT NULL AND NOT v_adim_penceresi_var THEN
    INSERT INTO randevu_cihaz_rezervasyon (klinik_id, randevu_id, cihaz_id, adim_id, tur, baslangic, bitis)
    VALUES (v_r.klinik_id, v_r.id, v_r.cihaz_id, NULL, 'manuel', v_r.baslangic, v_r.bitis);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Yalnız trigger çağırır; API'den çağrılabilseydi herkes başkasının
-- rezervasyonunu silip yeniden yazabilirdi.
REVOKE ALL ON FUNCTION randevu_cihaz_rezervasyon_yenile(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION randevu_cihaz_rezervasyon_tetikle()
RETURNS trigger AS $$
BEGIN
  PERFORM randevu_cihaz_rezervasyon_yenile(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION randevu_cihaz_rezervasyon_tetikle() FROM PUBLIC, anon, authenticated;

-- ==================== 4) Trigger'lar ====================
DROP TRIGGER IF EXISTS trg_randevu_cihaz_rezervasyon_ekle ON randevu;
CREATE TRIGGER trg_randevu_cihaz_rezervasyon_ekle
  AFTER INSERT ON randevu
  FOR EACH ROW EXECUTE FUNCTION randevu_cihaz_rezervasyon_tetikle();

-- Yalnız pencereyi etkileyen değişimlerde (snapshot korunur — bkz. başlık).
DROP TRIGGER IF EXISTS trg_randevu_cihaz_rezervasyon_guncelle ON randevu;
CREATE TRIGGER trg_randevu_cihaz_rezervasyon_guncelle
  AFTER UPDATE ON randevu
  FOR EACH ROW
  WHEN (
    OLD.baslangic IS DISTINCT FROM NEW.baslangic
    OR OLD.bitis IS DISTINCT FROM NEW.bitis
    OR OLD.islem_tanimi_id IS DISTINCT FROM NEW.islem_tanimi_id
    OR OLD.cihaz_id IS DISTINCT FROM NEW.cihaz_id
    OR (OLD.durum IN ('iptal', 'gelmedi')) IS DISTINCT FROM (NEW.durum IN ('iptal', 'gelmedi'))
  )
  EXECUTE FUNCTION randevu_cihaz_rezervasyon_tetikle();

-- ==================== 5) Backfill (yalnız devam eden/gelecek randevular) ====================
-- Geçmiş randevular çakışma korumasına ihtiyaç duymaz. Adım cihazları bugüne
-- kadar hiç zorlanmadığından mevcut veride çakışma olabilir: o randevu
-- NOTICE ile atlanır (migration patlamaz), sonuna eklenen kontrol sorgusuyla
-- listelenir.
DO $$
DECLARE
  r record;
  v_islenen integer := 0;
  v_atlanan integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM randevu
    WHERE durum NOT IN ('iptal', 'gelmedi') AND bitis > now()
  LOOP
    BEGIN
      PERFORM randevu_cihaz_rezervasyon_yenile(r.id);
      v_islenen := v_islenen + 1;
    EXCEPTION WHEN exclusion_violation THEN
      v_atlanan := v_atlanan + 1;
      RAISE NOTICE 'Cihaz rezervasyon çakışması, randevu atlandı: %', r.id;
    END;
  END LOOP;
  RAISE NOTICE 'Rezervasyon backfill: % işlendi, % atlandı', v_islenen, v_atlanan;
END;
$$;

-- ==================== 6) Eski tam-süre cihaz kısıtını kaldır ====================
-- randevu.cihaz_id kolonu DURUYOR (manuel seçim + arşiv); yalnız kısıt gidiyor,
-- yerini yukarıdaki rezervasyon kısıtı alıyor.
ALTER TABLE randevu DROP CONSTRAINT IF EXISTS randevu_cihaz_cakisma;

-- Kontrol:
-- 1) Backfill'de atlanan (rezervasyonsuz kalan) gelecek randevular — cihazlı adımı olup satırı olmayanlar:
--    SELECT r.id, r.baslangic, r.islem_tanimi_id FROM randevu r
--    WHERE r.durum NOT IN ('iptal','gelmedi') AND r.bitis > now() AND r.kaynak <> 'arsiv'
--      AND (r.cihaz_id IS NOT NULL OR EXISTS (SELECT 1 FROM islem_tanimi_adim a WHERE a.islem_tanimi_id = r.islem_tanimi_id AND a.gerekli_cihaz_id IS NOT NULL))
--      AND NOT EXISTS (SELECT 1 FROM randevu_cihaz_rezervasyon z WHERE z.randevu_id = r.id);
-- 2) Bir randevunun pencereleri:
--    SELECT z.tur, c.ad, z.baslangic, z.bitis FROM randevu_cihaz_rezervasyon z JOIN cihaz c ON c.id = z.cihaz_id WHERE z.randevu_id = '<id>' ORDER BY z.baslangic;
-- 3) Kısıt/trigger durumu:
--    SELECT conname FROM pg_constraint WHERE conrelid IN ('randevu'::regclass, 'randevu_cihaz_rezervasyon'::regclass) AND contype = 'x';
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'randevu'::regclass AND tgname LIKE 'trg_randevu_cihaz%';
--
-- Geri alma (gerekirse): trigger'ları düşür, randevu_cihaz_cakisma'yı (cekirdek_sema'daki tanımla) yeniden ekle,
--   sonra randevu_cihaz_rezervasyon tablosunu ve iki fonksiyonu DROP et.
