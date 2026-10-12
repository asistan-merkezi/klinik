-- 2026-10-12 kod denetimi düzeltmeleri (finans bütünlüğü).
--
-- 1) v_hasta_cari_ozet (Finans > Gelirler Takibi > Cari Alacaklar) yalnız BORÇ satırlarını
--    topluyordu: ödemeler/iadeler/krediler hiç düşmüyordu. "Tahsil Edilen" her zaman 0,
--    "Kalan Bakiye" hastanın tüm zamanlardaki toplam borcuydu — borcunu tamamen ödemiş
--    hasta da listede tam tutarla görünüyor, liste yıllar içinde borç almış HER hastayı
--    kapsayacak şekilde büyüyordu. Artık v_hasta_ozet.bakiye ile AYNI kural
--    (lib/hasta/bakiye-hareket-gorunum.ts ile de aynı — üçü birlikte değişir):
--      kredi → +tutar · borc → -(tutar - iskonto) · odeme (odeme_id NULL) → +tutar
--      iade (odeme_id NULL) → -tutar
--    toplam_bakiye = net borç toplamı, tahsil_edilen = ödeme + kredi - iade,
--    kalan_bakiye = toplam_bakiye - tahsil_edilen; yalnız kalan_bakiye > 0 olanlar listelenir.
--    Kolon adı/sırası/tipi değişmedi (CREATE OR REPLACE VIEW bunu şart koşar).
--
-- 2) Havale (banka) ile yapılan ödeme/tahsilat satırı banka hesabı SEÇİLMEDEN kaydedilebiliyordu
--    (Ödeme Ekle, seans ödemesi RPC'si, gider, personel ödemesi). Banka defteri hesap bazlı
--    çalıştığından bu satırlar HİÇBİR hesapta görünmüyor, mutabakat sessizce tutmuyordu.
--    Ayrıca SECURITY DEFINER RPC'ler (randevu_seans_bedelini_isle) p_banka_hesap_id'nin aynı
--    kliniğe ait olduğunu doğrulamıyordu. Ortak tetikleyici:
--      - banka_hesap_id doluysa aynı kliniğin hesabı olmalı (yalnız değiştiğinde kontrol);
--      - yöntem havale ise banka_hesap_id zorunlu (INSERT'te veya yöntem değiştiğinde —
--        eski kayıtlar ve banka hesabı silinince FK'nın SET NULL güncellemesi etkilenmez).
--
-- 3) Banka hesabı silinince hasta_bakiye_hareket/klinik_harcama/personel_hesap_hareket/
--    klinik_cari_odeme/klinik_kredi_karti_odeme'deki bağ ON DELETE SET NULL ile kopuyor,
--    o hesabın yıllara yayılan geçmişi Banka defterinden geri dönüşsüz kayboluyordu.
--    Doğrudan silme artık bağlı kayıt varsa reddedilir (banka_hesabi_kullaniliyor).
--    Klinik silinirken CASCADE ile gelen silme (tetikleyici derinliği > 1) engellenmez.

-- ---------------------------------------------------------------------------
-- 1) Cari Alacaklar görünümü
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_hasta_cari_ozet WITH (security_invoker = true) AS
SELECT
  h.id AS hasta_id,
  h.klinik_id,
  h.ad_soyad,
  (cari.borc - cari.tahsil) AS kalan_bakiye,
  cari.tahsil AS tahsil_edilen,
  cari.borc AS toplam_bakiye
FROM hasta h
JOIN LATERAL (
  SELECT
    COALESCE(sum(b.tutar - b.iskonto_tutari) FILTER (WHERE b.tur = 'borc'), 0)::numeric AS borc,
    COALESCE(sum(
      CASE
        WHEN b.tur = 'kredi' THEN b.tutar
        WHEN b.tur = 'odeme' AND b.odeme_id IS NULL THEN b.tutar
        WHEN b.tur = 'iade' AND b.odeme_id IS NULL THEN -b.tutar
        ELSE 0
      END
    ), 0)::numeric AS tahsil
  FROM hasta_bakiye_hareket b
  WHERE b.hasta_id = h.id
) cari ON true
WHERE cari.borc - cari.tahsil > 0;

-- ---------------------------------------------------------------------------
-- 2) Banka hesabı bütünlüğü (havale → hesap zorunlu, hesap aynı klinikten)
--    TG_ARGV: [0] yöntem kolonu, [1] havale değeri, [2] banka hesabı kolonu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION banka_hesabi_butunluk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yeni jsonb := to_jsonb(NEW);
  v_eski jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_yontem text := v_yeni ->> TG_ARGV[0];
  v_hesap uuid := (v_yeni ->> TG_ARGV[2])::uuid;
BEGIN
  IF v_hesap IS NOT NULL
     AND (TG_OP = 'INSERT' OR v_hesap IS DISTINCT FROM (v_eski ->> TG_ARGV[2])::uuid) THEN
    IF NOT EXISTS (
      SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = v_hesap AND b.klinik_id = NEW.klinik_id
    ) THEN
      RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_yontem = TG_ARGV[1] AND v_hesap IS NULL
     AND (TG_OP = 'INSERT' OR v_yontem IS DISTINCT FROM v_eski ->> TG_ARGV[0]) THEN
    RAISE EXCEPTION 'banka_hesabi_gerekli' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION banka_hesabi_butunluk() FROM PUBLIC, anon, authenticated;

-- Ada göre en son çalışsın (hasta_bakiye_hareket'te kredi kartı tahsilat tetikleyicisi
-- `trg_zz_...` banka_hesap_id'yi doldurur; kontrol ondan SONRA yapılmalı).
DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON hasta_bakiye_hareket;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON hasta_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_yontemi', 'banka_havalesi', 'banka_hesap_id');

DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON klinik_harcama;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON klinik_harcama
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');

DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON personel_hesap_hareket;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON personel_hesap_hareket
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');

DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON klinik_cari_odeme;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON klinik_cari_odeme
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');

DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON klinik_kredi_karti_odeme;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON klinik_kredi_karti_odeme
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');

-- ---------------------------------------------------------------------------
-- 3) Kullanılan banka hesabı silinemez
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION banka_hesabi_silme_engeli()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Klinik silinirken gelen CASCADE silmesi bir RI tetikleyicisinin içinden çalışır
  -- (derinlik > 1); onu engellemek klinik silmeyi bozardı.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM hasta_bakiye_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_harcama WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM personel_hesap_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_cari_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_kredi_karti_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM nakit_banka_hareketi
       WHERE kaynak_banka_hesap_id = OLD.id OR hedef_banka_hesap_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'banka_hesabi_kullaniliyor' USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION banka_hesabi_silme_engeli() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_banka_hesabi_silme_engeli ON klinik_banka_hesaplari;
CREATE TRIGGER trg_banka_hesabi_silme_engeli
  BEFORE DELETE ON klinik_banka_hesaplari
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_silme_engeli();

-- Silme kontrolündeki EXISTS sorguları ve Banka defteri için (yoksa tam tablo taraması).
CREATE INDEX IF NOT EXISTS idx_hasta_bakiye_hareket_banka_hesap
  ON hasta_bakiye_hareket (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_klinik_harcama_banka_hesap
  ON klinik_harcama (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personel_hesap_hareket_banka_hesap
  ON personel_hesap_hareket (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_klinik_cari_odeme_banka_hesap
  ON klinik_cari_odeme (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_klinik_kredi_karti_odeme_banka_hesap
  ON klinik_kredi_karti_odeme (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nakit_banka_hareketi_kaynak_banka
  ON nakit_banka_hareketi (kaynak_banka_hesap_id) WHERE kaynak_banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nakit_banka_hareketi_hedef_banka
  ON nakit_banka_hareketi (hedef_banka_hesap_id) WHERE hedef_banka_hesap_id IS NOT NULL;

-- Doğrulama (uygulandıktan sonra):
--   select count(*) from v_hasta_cari_ozet where tahsil_edilen <> 0;   -- ödeme yapmış borçlu varsa > 0
--   Kayıtlı hesabı olmayan havale satırı (eski veri, düzeltilmeli):
--   select 'hasta' t, count(*) from hasta_bakiye_hareket where odeme_yontemi='banka_havalesi' and banka_hesap_id is null
--   union all select 'gider', count(*) from klinik_harcama where odeme_tipi='havale' and banka_hesap_id is null
--   union all select 'personel', count(*) from personel_hesap_hareket where odeme_tipi='havale' and banka_hesap_id is null;
