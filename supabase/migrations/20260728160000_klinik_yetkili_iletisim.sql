-- Yetkili kişinin kendi telefon/e-posta'sı, şirket geneli telefon/e-posta'dan
-- ayrı tutulur (yetkili_kisi zaten sadece isimdi, iletişim bilgisi yoktu).
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS yetkili_telefon text;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS yetkili_eposta text;
