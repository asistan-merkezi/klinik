-- Motorlu Taşıtlar Vergisi / Trafik Cezası ödemelerinde hangi araca ait
-- olduğu seçilebilsin (kullanıcı kararı) — araç listesi Şirket Bilgileri >
-- Araçlar'dan (klinik_arac, migration 20260809110000) çekiliyor, burada ayrı
-- bir araç kaydı tutulmuyor. Diğer ödeme tiplerinde araç bağlanamaz (CHECK).
-- İdempotent, tek blok.

ALTER TABLE kamusal_odeme ADD COLUMN IF NOT EXISTS arac_id uuid REFERENCES klinik_arac(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kamusal_odeme_arac_id ON kamusal_odeme(arac_id);

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'kamusal_odeme'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%arac_id%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE kamusal_odeme DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_arac_id_tip_check
  CHECK (arac_id IS NULL OR odeme_tipi IN ('motorlu_tasitlar_vergisi', 'trafik_cezasi'));

-- Kontrol:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'kamusal_odeme'::regclass AND contype='c';
