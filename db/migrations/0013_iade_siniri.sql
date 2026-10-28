-- 0013 (elle yazıldı): İADE SINIRI (Modül 4a, karar A, 2026-10-28).
-- Kural: bir iade, bağlı olduğu ÖDEMENİN tutarından o ödemeye bağlı önceki iadeler düşülmüş kalanını AŞAMAZ.
--   • Normal iade `kaynak_hareket_id` ile bir `tur='odeme'` satırına bağlanır (aynı klinik, aynı hasta, aynı yöntem; havale ise aynı hesap).
--   • İSTİSNA (arşivden aktarılan ödeme, yanlış yöntemle girilmiş ödeme, paket iptali alacak iadesi...): yalnız klinik_admin, gerekçe (≥ 5 karakter) ZORUNLU,
--     `iade_istisna = true`, kaynak bağlantısı yok. İstisna iadeler audit_log v2 (iade_istisna, iade_istisna_gerekcesi alanları) ve Raporlar'da ayırt edilebilir.
-- Eşzamanlılık: tetikleyici kaynak ödeme satırını FOR UPDATE kilitler → aynı ödemeye iki eşzamanlı iade sırayla değerlendirilir, toplamı aşamaz.
SET search_path = public, extensions;

ALTER TABLE hasta_bakiye_hareket
  ADD COLUMN kaynak_hareket_id uuid REFERENCES hasta_bakiye_hareket(id),
  ADD COLUMN iade_istisna boolean NOT NULL DEFAULT false,
  ADD COLUMN iade_istisna_gerekcesi text;

CREATE INDEX idx_hasta_bakiye_hareket_kaynak ON hasta_bakiye_hareket (kaynak_hareket_id) WHERE kaynak_hareket_id IS NOT NULL;

ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_iade_kaynak_kurali CHECK (
  (tur = 'iade' AND (
      (kaynak_hareket_id IS NOT NULL AND NOT iade_istisna AND iade_istisna_gerekcesi IS NULL)
      OR (kaynak_hareket_id IS NULL AND iade_istisna AND length(btrim(coalesce(iade_istisna_gerekcesi, ''))) >= 5)))
  OR (tur <> 'iade' AND kaynak_hareket_id IS NULL AND NOT iade_istisna AND iade_istisna_gerekcesi IS NULL)
);

-- SECURITY DEFINER: kaynak satırı FOR UPDATE ile kilitlemek UPDATE yetkisi ister (uygulama rolünde yok); sahip rolü tenant politikasına tabi kalır (FORCE RLS).
CREATE FUNCTION hasta_bakiye_hareket_iade_siniri() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_k hasta_bakiye_hareket%ROWTYPE;
  v_iade numeric;
BEGIN
  IF NEW.tur <> 'iade' THEN
    RETURN NEW;
  END IF;

  IF NEW.iade_istisna THEN
    IF NOT (current_rol() = 'klinik_admin' OR is_super_admin()) THEN
      RAISE EXCEPTION 'iade_istisna_yetkisiz';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_k FROM hasta_bakiye_hareket WHERE id = NEW.kaynak_hareket_id FOR UPDATE;
  IF NOT FOUND
     OR v_k.klinik_id <> NEW.klinik_id
     OR v_k.hasta_id <> NEW.hasta_id
     OR v_k.tur <> 'odeme'
     OR v_k.odeme_yontemi IS DISTINCT FROM NEW.odeme_yontemi
     OR (NEW.odeme_yontemi = 'banka_havalesi' AND v_k.banka_hesap_id IS DISTINCT FROM NEW.banka_hesap_id) THEN
    RAISE EXCEPTION 'iade_kaynak_gecersiz';
  END IF;

  SELECT coalesce(sum(tutar), 0) INTO v_iade FROM hasta_bakiye_hareket WHERE kaynak_hareket_id = v_k.id;
  IF NEW.tutar > v_k.tutar - v_iade THEN
    RAISE EXCEPTION 'iade_asimi:kalan=%', v_k.tutar - v_iade;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hasta_bakiye_hareket_iade_siniri BEFORE INSERT ON hasta_bakiye_hareket
  FOR EACH ROW EXECUTE FUNCTION hasta_bakiye_hareket_iade_siniri();
