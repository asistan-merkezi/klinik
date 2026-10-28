-- Odanın aynı anda alabileceği maksimum hasta sayısı (grup seansları için,
-- örn. Group Pilates, Bel-Boyun Okulu). Varsayılan 1 = normal bireysel oda.
ALTER TABLE oda ADD COLUMN IF NOT EXISTS kapasite integer NOT NULL DEFAULT 1 CHECK (kapasite >= 1);
