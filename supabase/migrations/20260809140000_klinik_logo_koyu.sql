-- Kapı tableti kurumsal görünümü: koyu zeminde açık logolar kaybolabiliyor,
-- opsiyonel bir "koyu tema logosu" eklenir. logo_url ile aynı bucket/desen
-- (klinik-logo, path {klinik_id}/logo-koyu.<uzanti>) — bucket zaten public.
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS logo_url_koyu text;
