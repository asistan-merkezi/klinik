-- Tedavi Tanımları: tek "fiyat" yerine 4 kademeli fiyat (vita/plus/elit/prime)
-- + kademe bazlı fiyat geçmişi (kullanıcı isteği). Kullanıcı kararı: vita_fiyat
-- ana/master fiyat — mevcut "Fiyat (₺)" alanı aynen bu alana yazmaya devam
-- ediyor; plus/elit/prime opsiyonel override (boş bırakılırsa hasta
-- kategorisine göre iskonto oranından hesaplanır, bkz. bir sonraki migration
-- 20260805110000_hasta_kategori_iskonto_oranlari.sql). Eski "fiyat" kolonu
-- CLAUDE.md'nin "backward-compat shim yok" prensibiyle tam olarak vita_fiyat'a
-- taşınıp kaldırıldı (iki kaynak tutulmuyor) — odeme_olustur ve
-- randevu_gelis_isaretle RPC'leri bir sonraki migration'da (aynı push'ta)
-- güncelleniyor, aradaki pencerede gerçek trafik yok.
--
-- islem_tanimi_fiyat_gecmisi CLAUDE.md'nin veri modelinde tarif edilmişti ama
-- hiçbir migration'da CREATE edilmemişti (hasta_belge/hasta_onam ile aynı
-- durum) — ilk kez burada oluşturuluyor, kademe bazlı. Yazma tamamen DB
-- trigger'ıyla otomatik (audit_log_yaz deseniyle aynı SECURITY DEFINER
-- yaklaşımı) — uygulama kodu tetiklemiyor. Bu turda sadece şema + trigger,
-- görüntüleme ekranı yok (projenin tekrarlayan "şema önce UI sonra" deseni).

-- ==================== 1) Kademeli fiyat kolonları ====================
ALTER TABLE islem_tanimi ADD COLUMN IF NOT EXISTS vita_fiyat numeric(10, 2);
ALTER TABLE islem_tanimi ADD COLUMN IF NOT EXISTS plus_fiyat numeric(10, 2);
ALTER TABLE islem_tanimi ADD COLUMN IF NOT EXISTS elit_fiyat numeric(10, 2);
ALTER TABLE islem_tanimi ADD COLUMN IF NOT EXISTS prime_fiyat numeric(10, 2);

UPDATE islem_tanimi SET vita_fiyat = fiyat WHERE vita_fiyat IS NULL;

ALTER TABLE islem_tanimi ALTER COLUMN vita_fiyat SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'islem_tanimi_vita_fiyat_check') THEN
    ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_vita_fiyat_check CHECK (vita_fiyat >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'islem_tanimi_plus_fiyat_check') THEN
    ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_plus_fiyat_check CHECK (plus_fiyat IS NULL OR plus_fiyat >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'islem_tanimi_elit_fiyat_check') THEN
    ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_elit_fiyat_check CHECK (elit_fiyat IS NULL OR elit_fiyat >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'islem_tanimi_prime_fiyat_check') THEN
    ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_prime_fiyat_check CHECK (prime_fiyat IS NULL OR prime_fiyat >= 0);
  END IF;
END $$;

ALTER TABLE islem_tanimi DROP COLUMN IF EXISTS fiyat;

-- ==================== 2) islem_tanimi_fiyat_gecmisi ====================
CREATE TABLE IF NOT EXISTS islem_tanimi_fiyat_gecmisi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE CASCADE,
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  vita_fiyat numeric(10, 2) NOT NULL,
  plus_fiyat numeric(10, 2),
  elit_fiyat numeric(10, 2),
  prime_fiyat numeric(10, 2),
  kdv_orani numeric(5, 2) NOT NULL,
  gecerlilik_baslangic timestamptz NOT NULL DEFAULT now(),
  gecerlilik_bitis timestamptz,
  degistiren_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE islem_tanimi_fiyat_gecmisi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_fiyat_gecmisi_klinik_id ON islem_tanimi_fiyat_gecmisi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_fiyat_gecmisi_islem_id ON islem_tanimi_fiyat_gecmisi(islem_tanimi_id);

-- Bir tedavinin en fazla bir "açık" (hâlâ geçerli) geçmiş satırı olabilir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_islem_tanimi_fiyat_gecmisi_acik
  ON islem_tanimi_fiyat_gecmisi (islem_tanimi_id) WHERE gecerlilik_bitis IS NULL;

DROP POLICY IF EXISTS "islem_tanimi_fiyat_gecmisi_select_klinik" ON islem_tanimi_fiyat_gecmisi;
CREATE POLICY "islem_tanimi_fiyat_gecmisi_select_klinik" ON islem_tanimi_fiyat_gecmisi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());
-- Bilinçli olarak INSERT/UPDATE/DELETE policy'si yok: satırlar sadece aşağıdaki
-- SECURITY DEFINER trigger fonksiyonuyla yazılıyor (audit_log_yaz deseniyle aynı).

CREATE OR REPLACE FUNCTION islem_tanimi_fiyat_gecmisi_yaz()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE islem_tanimi_fiyat_gecmisi
      SET gecerlilik_bitis = now()
      WHERE islem_tanimi_id = NEW.id AND gecerlilik_bitis IS NULL;
  END IF;

  INSERT INTO islem_tanimi_fiyat_gecmisi
    (islem_tanimi_id, klinik_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, degistiren_kullanici_id)
  VALUES
    (NEW.id, NEW.klinik_id, NEW.vita_fiyat, NEW.plus_fiyat, NEW.elit_fiyat, NEW.prime_fiyat, NEW.kdv_orani, auth.uid());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_islem_tanimi_fiyat_gecmisi_insert ON islem_tanimi;
CREATE TRIGGER trg_islem_tanimi_fiyat_gecmisi_insert
  AFTER INSERT ON islem_tanimi
  FOR EACH ROW EXECUTE FUNCTION islem_tanimi_fiyat_gecmisi_yaz();

DROP TRIGGER IF EXISTS trg_islem_tanimi_fiyat_gecmisi_update ON islem_tanimi;
CREATE TRIGGER trg_islem_tanimi_fiyat_gecmisi_update
  AFTER UPDATE ON islem_tanimi
  FOR EACH ROW
  WHEN (
    OLD.vita_fiyat IS DISTINCT FROM NEW.vita_fiyat
    OR OLD.plus_fiyat IS DISTINCT FROM NEW.plus_fiyat
    OR OLD.elit_fiyat IS DISTINCT FROM NEW.elit_fiyat
    OR OLD.prime_fiyat IS DISTINCT FROM NEW.prime_fiyat
    OR OLD.kdv_orani IS DISTINCT FROM NEW.kdv_orani
  )
  EXECUTE FUNCTION islem_tanimi_fiyat_gecmisi_yaz();

-- Mevcut kayıtlar için ilk geçmiş satırını geriye dönük oluştur (idempotent:
-- migration tekrar çalışırsa uq_islem_tanimi_fiyat_gecmisi_acik zaten açık
-- satırı olanları ON CONFLICT ile atlar).
INSERT INTO islem_tanimi_fiyat_gecmisi (islem_tanimi_id, klinik_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani)
SELECT id, klinik_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani
FROM islem_tanimi
ON CONFLICT (islem_tanimi_id) WHERE gecerlilik_bitis IS NULL DO NOTHING;

-- Kontrol:
-- SELECT vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat FROM islem_tanimi LIMIT 5;
-- SELECT * FROM islem_tanimi_fiyat_gecmisi LIMIT 5;
