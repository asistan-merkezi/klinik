-- Kredi kartı TAHSİLAT ayarı (Şirket Bilgileri > Kredi Kartları > Tahsilat Bilgisi):
-- kartla alınan hasta tahsilatının yatacağı banka hesabı + komisyon oranı (en çok %3,5).
--
-- Hasta tahsilatı (hasta_bakiye_hareket tur='odeme', odeme_yontemi='kredi_karti') eklenince
-- BEFORE INSERT tetikleyicisi satıra o anki ayardan banka_hesap_id + komisyon_orani yazar
-- (oran satıra KOPYALANIR: sonradan oran değişince geçmiş hareketler bozulmaz). Hasta bakiyesi
-- brüt tutar kadar düşer; Banka defteri ise bağlı hesaba NET (tutar - komisyon) yazar.
-- Tüm yazma yolları (Ödeme Ekle, randevu_seans_bedelini_isle, vb.) otomatik kapsanır, RPC değişmez.
-- Tahsilat hesabı ayarlanmamışsa satır eskisi gibi kalır (Banka'ya düşmez). Geçmiş satırlar
-- BACKFILL EDİLMEZ (komisyon_orani/banka_hesap_id NULL). İdempotent.

ALTER TABLE klinik
  ADD COLUMN IF NOT EXISTS kredi_karti_tahsilat_banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kredi_karti_komisyon_orani numeric(4,2) NOT NULL DEFAULT 0
    CHECK (kredi_karti_komisyon_orani >= 0 AND kredi_karti_komisyon_orani <= 3.5);

ALTER TABLE hasta_bakiye_hareket
  ADD COLUMN IF NOT EXISTS komisyon_orani numeric(4,2)
    CHECK (komisyon_orani IS NULL OR (komisyon_orani >= 0 AND komisyon_orani <= 3.5));

CREATE OR REPLACE FUNCTION hasta_bakiye_hareket_kredi_karti_ayari()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_klinik_id uuid := NEW.klinik_id;
  v_hesap uuid;
  v_oran numeric;
BEGIN
  IF NEW.tur <> 'odeme' OR NEW.odeme_yontemi IS DISTINCT FROM 'kredi_karti' THEN
    RETURN NEW;
  END IF;

  IF v_klinik_id IS NULL THEN
    SELECT h.klinik_id INTO v_klinik_id FROM hasta h WHERE h.id = NEW.hasta_id;
  END IF;

  SELECT k.kredi_karti_tahsilat_banka_hesap_id, k.kredi_karti_komisyon_orani
    INTO v_hesap, v_oran
    FROM klinik k WHERE k.id = v_klinik_id;

  IF v_hesap IS NOT NULL THEN
    NEW.banka_hesap_id := v_hesap;
    NEW.komisyon_orani := coalesce(v_oran, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_hasta_bakiye_hareket_kredi_karti ON hasta_bakiye_hareket;
CREATE TRIGGER trg_zz_hasta_bakiye_hareket_kredi_karti
  BEFORE INSERT ON hasta_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION hasta_bakiye_hareket_kredi_karti_ayari();

-- Banka dönem başı bakiyesi: kredi kartı tahsilatı NET (tutar - komisyon) olarak bağlı hesaba eklenir.
-- Gövde 20261005090000'daki ile aynı, yalnız kredi kartı terimi eklendi (imza aynı → CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION banka_bakiye_once_toplam_tumu(p_once_tarih date)
RETURNS TABLE(banka_hesap_id uuid, toplam numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
BEGIN
  IF NOT (current_rol() IN ('klinik_admin', 'muhasebe') OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    coalesce((
      SELECT sum(h.tutar) FROM hasta_bakiye_hareket h
      WHERE h.klinik_id = v_klinik_id AND h.tur = 'odeme' AND h.odeme_yontemi = 'banka_havalesi'
        AND h.banka_hesap_id = b.id AND h.created_at < v_once_ts
    ), 0)
    + coalesce((
      SELECT sum(h.tutar - round(h.tutar * coalesce(h.komisyon_orani, 0) / 100, 2)) FROM hasta_bakiye_hareket h
      WHERE h.klinik_id = v_klinik_id AND h.tur = 'odeme' AND h.odeme_yontemi = 'kredi_karti'
        AND h.banka_hesap_id = b.id AND h.created_at < v_once_ts
    ), 0)
    - coalesce((
      SELECT sum(h.tutar) FROM hasta_bakiye_hareket h
      WHERE h.klinik_id = v_klinik_id AND h.tur = 'iade' AND h.odeme_yontemi = 'banka_havalesi'
        AND h.banka_hesap_id = b.id AND h.created_at < v_once_ts
    ), 0)
    - coalesce((
      SELECT sum(g.tutar) FROM klinik_harcama g
      WHERE g.klinik_id = v_klinik_id AND g.odeme_tipi = 'havale' AND g.banka_hesap_id = b.id AND g.tarih < p_once_tarih
    ), 0)
    - coalesce((
      SELECT sum(p.tutar) FROM personel_hesap_hareket p
      WHERE p.klinik_id = v_klinik_id AND p.odeme_tipi = 'havale' AND p.tur IN ('odeme', 'avans')
        AND p.banka_hesap_id = b.id AND p.tarih < p_once_tarih
    ), 0)
    + coalesce((
      SELECT sum(n.tutar) FROM nakit_banka_hareketi n
      WHERE n.klinik_id = v_klinik_id AND n.hedef_banka_hesap_id = b.id AND n.tarih < p_once_tarih
    ), 0)
    - coalesce((
      SELECT sum(n.tutar) FROM nakit_banka_hareketi n
      WHERE n.klinik_id = v_klinik_id AND n.kaynak_banka_hesap_id = b.id AND n.tarih < p_once_tarih
    ), 0)
  FROM klinik_banka_hesaplari b
  WHERE b.klinik_id = v_klinik_id;
END;
$$;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name IN ('klinik','hasta_bakiye_hareket') AND column_name LIKE '%komisyon%' OR column_name LIKE 'kredi_karti_tahsilat%';
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'banka_bakiye_once_toplam_tumu'; -- TEK satır
