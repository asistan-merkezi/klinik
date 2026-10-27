-- 0006: Paraşüt client secret'ının VAR OLUP OLMADIĞI bilgisi için üretilmiş boolean kolon (docs/service-role-siniflama.md #4).
-- Secret kolonu uygulama rolüne SELECT'e kapalıdır; "secret girilmiş mi?" sorusu eskiden service role ile cevaplanıyordu.
-- Üretilmiş kolon yalnız bir boolean taşır (secret'ı açığa vurmaz); klinik_uygulama'ya yalnız bu kolon için SELECT verilir.
ALTER TABLE klinik_muhasebe_entegrasyonu
  ADD COLUMN parasut_secret_var boolean GENERATED ALWAYS AS (parasut_client_secret IS NOT NULL AND parasut_client_secret <> '') STORED;
GRANT SELECT (parasut_secret_var) ON klinik_muhasebe_entegrasyonu TO klinik_uygulama;
