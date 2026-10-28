-- Geliştirilmiş Anamnez Formu: her tıbbi ön geçmiş parametresi artık ayrı bir
-- "Evet/Hayır" (var/yok) bayrağıyla takip edilir (NULL = henüz sorulmadı/yanıtsız,
-- true/false = hastanın açık yanıtı), yanına serbest metin detay alanı eklenir.
-- Mevcut serbest metin kolonları (kronik_hastaliklar, surekli_ilaclar, alerjiler,
-- gecirilmis_ameliyatlar) detay alanı olarak korunur, sadece yanlarına _var
-- bayrakları eklenir. kan_sulandirici_kullanimi zaten boolean'dı, sadece detay
-- kolonu ekleniyor. Yeni parametreler: bulaşıcı hastalık, protez/implant,
-- hamilelik-emzirme, sigara/alkol/madde.

ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS alerji_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS kronik_hastalik_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS surekli_ilac_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS ameliyat_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS kan_sulandirici_detay text;

ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS bulasici_hastalik_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS bulasici_hastalik_detay text;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS protez_implant_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS protez_implant_detay text;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS hamilelik_emzirme_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS hamilelik_emzirme_detay text;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS sigara_alkol_madde_var boolean;
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS sigara_alkol_madde_detay text;

-- Öncelik/aciliyet durumu (triage): reception'ın hasta kartında görebileceği
-- basit bir rozet; sağlık verisi değil, bu yüzden ozel_nitelikli_veri_onay_tarihi
-- rızasına bağlı değildir.
ALTER TABLE musteri_hassas ADD COLUMN IF NOT EXISTS oncelik_durumu text
  NOT NULL DEFAULT 'normal' CHECK (oncelik_durumu IN ('normal', 'oncelikli', 'acil'));

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'musteri_hassas'
--   AND column_name IN ('alerji_var','kronik_hastalik_var','surekli_ilac_var','ameliyat_var',
--   'kan_sulandirici_detay','bulasici_hastalik_var','bulasici_hastalik_detay','protez_implant_var',
--   'protez_implant_detay','hamilelik_emzirme_var','hamilelik_emzirme_detay',
--   'sigara_alkol_madde_var','sigara_alkol_madde_detay','oncelik_durumu');
