-- Ayarlar > Şirket Bilgileri: hafta içi/cumartesi/pazar çalışma saatleri.
-- Her gün grubu için ayrı başlangıç/bitiş (time, dakika hassasiyetli); ikisi de
-- NULL ise o gün kapalı sayılır (ayrı bir "kapalı" bayrağına gerek yok, mevcut
-- nullable alan deseniyle tutarlı).
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS hafta_ici_baslangic time;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS hafta_ici_bitis time;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS cumartesi_baslangic time;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS cumartesi_bitis time;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS pazar_baslangic time;
ALTER TABLE klinik ADD COLUMN IF NOT EXISTS pazar_bitis time;
