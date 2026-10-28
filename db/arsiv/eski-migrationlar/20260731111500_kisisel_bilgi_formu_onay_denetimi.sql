-- "Kişisel Bilgi Giriş Formu" kartına (Hasta Detay > Kişisel Bilgiler) üç onay
-- bloğu (KVKK/sağlık verisi/ticari ileti) + onaylayan kişi, ve formu
-- dolduran/son değiştiren kişi+tarih bilgisi eklendi (kullanıcı talebi).
--
-- Onaylayan/dolduran iki türden biri olabilir: 'hasta' (portaldan hasta kendisi
-- onayladı/doldurdu — hasta_id zaten satırın sahibi olduğu için ayrı bir isim
-- saklamaya gerek yok, hasta.ad_soyad gösterilir) veya 'personel' (klinik_admin/
-- resepsiyon panelden onayladı/doldurdu — kullanici_id saklanıp ad_soyad join'le
-- gösterilir). "QR kodla hasta girişi" bu projede henüz ayrı bir self-servis
-- form akışı değil (CLAUDE.md: QR sadece randevu check-in için, tablet
-- kiosk MVP'de ertelendi) — "hasta kendisi doldurdu/onayladı" senaryosu bu
-- yüzden mevcut Hasta Portalı (/portal/bilgilerim) akışıyla eşleştirildi.
-- İdempotent, tek blok.

-- 1) hasta: 3 onay tipi için onaylayan bilgisi
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS kvkk_onaylayan_tip text CHECK (kvkk_onaylayan_tip IN ('hasta', 'personel'));
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS kvkk_onaylayan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS ozel_nitelikli_onaylayan_tip text CHECK (ozel_nitelikli_onaylayan_tip IN ('hasta', 'personel'));
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS ozel_nitelikli_onaylayan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS ticari_ileti_onaylayan_tip text CHECK (ticari_ileti_onaylayan_tip IN ('hasta', 'personel'));
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS ticari_ileti_onaylayan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;

-- 2) hasta_hassas: formu dolduran (olusturan) + son değiştiren kişi
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS olusturan_tip text CHECK (olusturan_tip IN ('hasta', 'personel'));
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS son_guncelleyen_tip text CHECK (son_guncelleyen_tip IN ('hasta', 'personel'));
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS son_guncelleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL;

-- olusturan/son_guncelleyen client'tan gelen değere göre DEĞİL, sunucu
-- session'ından (current_rol()/current_hasta_id()) otomatik türetiliyor —
-- app kodu bu kolonları hiç göndermiyor, spoof edilemez. Aynı desen
-- hasta_hassas_klinik_id_ata'da zaten kullanılıyordu.
CREATE OR REPLACE FUNCTION hasta_hassas_denetim_bilgisi_ata()
RETURNS trigger AS $$
BEGIN
  IF current_rol() IS NOT NULL THEN
    NEW.son_guncelleyen_tip := 'personel';
    NEW.son_guncelleyen_kullanici_id := auth.uid();
  ELSIF current_hasta_id() IS NOT NULL THEN
    NEW.son_guncelleyen_tip := 'hasta';
    NEW.son_guncelleyen_kullanici_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.olusturan_tip := NEW.son_guncelleyen_tip;
    NEW.olusturan_kullanici_id := NEW.son_guncelleyen_kullanici_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_hasta_hassas_denetim ON hasta_hassas;
CREATE TRIGGER trg_hasta_hassas_denetim
  BEFORE INSERT OR UPDATE ON hasta_hassas
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_denetim_bilgisi_ata();

-- Terapist kısıtlama trigger'ı (migration 20260731100000) güncellendi: yukarıdaki
-- yeni trigger her UPDATE'te son_guncelleyen_tip/kullanici_id'yi otomatik
-- değiştirdiği için, bu iki kolon "terapist sadece anamnez değiştirebilir"
-- karşılaştırmasına DAHİL EDİLMEMELİ — yoksa her terapist anamnez kaydında
-- (bu iki denetim kolonu OLD'dan farklı olduğu için) sahte bir "izinsiz alan
-- değişikliği" algılanıp tüm kayıt yine reddedilirdi (aynı sınıf hatanın
-- üçüncü tekrarı olurdu, bu yüzden trigger fonksiyonu burada güncelleniyor).
-- Trigger adı alfabetik sırada "denetim" < "terapist_kisitla" olduğu için bu
-- kolonlar NEW'de zaten atanmış oluyor, ekleme trigger'ı çalışmadan önce.
CREATE OR REPLACE FUNCTION hasta_hassas_terapist_sadece_anamnez_guncelle()
RETURNS trigger AS $$
DECLARE
  v_anamnez_kolonlari text[] := ARRAY[
    'alerji_var','alerjiler','kan_sulandirici_kullanimi','kan_sulandirici_detay',
    'kronik_hastalik_var','kronik_hastaliklar','surekli_ilac_var','surekli_ilaclar',
    'ameliyat_var','gecirilmis_ameliyatlar','bulasici_hastalik_var','bulasici_hastalik_detay',
    'protez_implant_var','protez_implant_detay','hamilelik_emzirme_var','hamilelik_emzirme_detay',
    'sigara_alkol_madde_var','sigara_alkol_madde_detay','gelis_sebebi','oncelik_durumu','updated_at',
    'son_guncelleyen_tip','son_guncelleyen_kullanici_id'
  ];
BEGIN
  IF current_rol() = 'terapist' THEN
    IF (to_jsonb(NEW) - v_anamnez_kolonlari) IS DISTINCT FROM (to_jsonb(OLD) - v_anamnez_kolonlari) THEN
      RAISE EXCEPTION 'terapist_sadece_anamnez_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta' AND column_name LIKE '%onaylayan%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_hassas' AND column_name IN ('olusturan_tip','olusturan_kullanici_id','son_guncelleyen_tip','son_guncelleyen_kullanici_id');
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'hasta_hassas'::regclass AND NOT tgisinternal ORDER BY 1;
