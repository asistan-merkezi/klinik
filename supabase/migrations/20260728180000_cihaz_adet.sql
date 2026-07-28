-- Cihazlarda adet/stok bilgisi (aynı cihazdan birden fazla adet olabilir,
-- örn. 2 Reformer). Odalarda adet kavramı yok, sadece cihaz tablosuna eklenir.
ALTER TABLE cihaz ADD COLUMN IF NOT EXISTS adet integer NOT NULL DEFAULT 1 CHECK (adet >= 1);
