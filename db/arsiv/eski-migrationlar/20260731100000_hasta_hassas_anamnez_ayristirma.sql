-- İki gerçek üretim hatası art arda bulundu (kullanıcı bildirdi):
-- 1) "18 yaş altı" popup'ında girilen anne/baba bilgisi bazen hiç kaydolmuyordu
--    (önceki migration'da TC kimlik 11 hane sert kontrolü sebebiyleydi, düzeltildi).
-- 2) "Tıbbi Ön Geçmiş" (anamnez) girildiğinde kayıtta kalmıyor: Detaylı Bilgiler
--    & Anamnez TEK bir formdu, ad_soyad/telefon/doğum tarihi de aynı submit'e
--    dahildi. app/(app)/panel/hastalar/[id]/detayli-bilgiler-karti.tsx telefon
--    alanını +90 formatına ZORUNLU yeniden biçimlendiriyor (ör. "0532..." ->
--    "+90532..."), yani terapist telefon'a hiç dokunmasa bile hasta.telefon
--    her submit'te FARKLI bir string olarak gönderiliyordu. Bu da
--    hasta_terapist_sadece_risk_guncelle trigger'ını (musteri_takibi_semasi
--    migration'ı, terapist'in hasta tablosunda SADECE risk_bayraklari
--    değiştirebilmesini garanti eden) her terapist submit'inde tetikleyip
--    RAISE EXCEPTION ile TÜM formu (anamnez dahil) reddediyordu.
--
-- Kalıcı çözüm: form ikiye ayrıldı (uygulama tarafı — bkz. actions.ts).
--   - Kimlik/İletişim/Adres/Acil Durum/Veli (anne-baba-diğer yakını):
--     sadece klinik_admin/resepsiyon (temelBilgileriGuncelle action'ı).
--   - Tıbbi Ön Geçmiş/Geliş Sebebi/Öncelik: terapist + klinik_admin/resepsiyon
--     (anamnezGuncelle action'ı), hasta tablosuna hiç dokunmuyor.
-- DB tarafında da aynı ayrım bir trigger ile garanti altına alınıyor (terapist
-- API'yi doğrudan çağırsa bile kimlik/adres/veli alanlarını değiştiremez) —
-- hasta.risk_bayraklari için kullanılan desenle aynı.
--
-- Ayrıca kullanıcının istediği "Diğer Yakını" (ad soyad + telefon + yakınlık
-- derecesi) alanları anne/baba'nın yanına eklendi.
-- İdempotent, tek blok.

ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS diger_yakini_ad_soyad text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS diger_yakini_telefon text;
ALTER TABLE hasta_hassas ADD COLUMN IF NOT EXISTS diger_yakini_yakinlik text;

CREATE OR REPLACE FUNCTION hasta_hassas_terapist_sadece_anamnez_guncelle()
RETURNS trigger AS $$
DECLARE
  v_anamnez_kolonlari text[] := ARRAY[
    'alerji_var','alerjiler','kan_sulandirici_kullanimi','kan_sulandirici_detay',
    'kronik_hastalik_var','kronik_hastaliklar','surekli_ilac_var','surekli_ilaclar',
    'ameliyat_var','gecirilmis_ameliyatlar','bulasici_hastalik_var','bulasici_hastalik_detay',
    'protez_implant_var','protez_implant_detay','hamilelik_emzirme_var','hamilelik_emzirme_detay',
    'sigara_alkol_madde_var','sigara_alkol_madde_detay','gelis_sebebi','oncelik_durumu','updated_at'
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

DROP TRIGGER IF EXISTS trg_hasta_hassas_terapist_kisitla ON hasta_hassas;
CREATE TRIGGER trg_hasta_hassas_terapist_kisitla
  BEFORE UPDATE ON hasta_hassas
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_terapist_sadece_anamnez_guncelle();

-- Terapist ilk kez (hiç kimlik_no girilmemiş hastada) anamnez girip satırı
-- INSERT ediyorsa da kimlik/adres/veli alanlarını dolu göndermemeli.
CREATE OR REPLACE FUNCTION hasta_hassas_terapist_sadece_anamnez_ekle()
RETURNS trigger AS $$
BEGIN
  IF current_rol() = 'terapist' THEN
    IF NEW.kimlik_no IS NOT NULL OR NEW.kimlik_no_tipi IS NOT NULL OR NEW.il IS NOT NULL
       OR NEW.ilce IS NOT NULL OR NEW.mahalle IS NOT NULL OR NEW.adres IS NOT NULL
       OR NEW.acil_durum_ad_soyad IS NOT NULL OR NEW.acil_durum_yakinlik IS NOT NULL
       OR NEW.acil_durum_telefon IS NOT NULL OR NEW.anne_adi IS NOT NULL OR NEW.anne_telefon IS NOT NULL
       OR NEW.baba_adi IS NOT NULL OR NEW.baba_telefon IS NOT NULL
       OR NEW.diger_yakini_ad_soyad IS NOT NULL OR NEW.diger_yakini_telefon IS NOT NULL
       OR NEW.diger_yakini_yakinlik IS NOT NULL THEN
      RAISE EXCEPTION 'terapist_sadece_anamnez_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_hasta_hassas_terapist_ekleme_kisitla ON hasta_hassas;
CREATE TRIGGER trg_hasta_hassas_terapist_ekleme_kisitla
  BEFORE INSERT ON hasta_hassas
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_terapist_sadece_anamnez_ekle();

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_hassas' AND column_name LIKE 'diger_yakini_%';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'hasta_hassas'::regclass AND NOT tgisinternal;
