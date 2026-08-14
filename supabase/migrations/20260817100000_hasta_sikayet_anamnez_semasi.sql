-- Şikayet & Anamnez: hasta bazlı TEKRARLI şikayet/anamnez kayıtları
-- (kullanıcı kararı: "ileride başka şikayetlerden de gelinebilir, her
-- şikayetin takibi yapılması gerekir" — bu yüzden hasta_hassas'taki gibi TEK
-- satır değil, id PK'lı bir kayıt listesi). Tedavi & Anamnez sekmesinde
-- (Kişisel Bilgiler sekmesindeki hasta_hassas anamnez formundan AYRI bir
-- kart olarak) gösterilir.
--
-- "Başvuru şikayeti" ve "Özgeçmiş" (kronik hastalık/ameliyat/sürekli ilaç)
-- BİLİNÇLİ OLARAK burada tekrar edilmiyor — bu alanlar zaten hasta_hassas'ta
-- var (gelis_sebebi, kronik_hastalik_var/kronik_hastaliklar, ameliyat_var/
-- gecirilmis_ameliyatlar, surekli_ilac_var/surekli_ilaclar) ve kullanıcı
-- kararıyla mevcut sistem (Kişisel Bilgiler sekmesi) korunuyor; yeni tablo
-- sadece gerçekten eksik olan 3 alanı (şikayet başlangıcı, ağrı öyküsü, ilk
-- değerlendirme notu) + tekrarlı kayıt/durum takibini ekliyor.
--
-- İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS hasta_anamnez (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  hasta_id uuid NOT NULL REFERENCES hasta(id) ON DELETE CASCADE,

  basvuru_sikayeti text NOT NULL,
  sikayet_baslangici text,
  agri_oykusu text,
  ilk_degerlendirme_notu text,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'cozuldu')),

  olusturan_tip text CHECK (olusturan_tip IN ('hasta', 'personel')),
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  son_guncelleyen_tip text CHECK (son_guncelleyen_tip IN ('hasta', 'personel')),
  son_guncelleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hasta_anamnez_hasta_id ON hasta_anamnez(hasta_id);
CREATE INDEX IF NOT EXISTS idx_hasta_anamnez_klinik_id ON hasta_anamnez(klinik_id);

ALTER TABLE hasta_anamnez ENABLE ROW LEVEL SECURITY;

-- klinik_id: musteri_hedef/hasta_hedef'teki generic desenin aynısı.
DROP TRIGGER IF EXISTS trg_hasta_anamnez_klinik_id ON hasta_anamnez;
CREATE TRIGGER trg_hasta_anamnez_klinik_id
  BEFORE INSERT ON hasta_anamnez
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');

-- olusturan_*/son_guncelleyen_*: hasta_hassas_denetim_bilgisi_ata() tablo-
-- agnostik (migration 20260731111500'te belgelendiği gibi sadece NEW.<kolon>
-- atıyor, hasta_hassas'a özel bir mantık içermiyor) — burada da aynen
-- yeniden kullanılıyor, yeni bir trigger fonksiyonu yazılmadı.
DROP TRIGGER IF EXISTS trg_hasta_anamnez_denetim ON hasta_anamnez;
CREATE TRIGGER trg_hasta_anamnez_denetim
  BEFORE INSERT OR UPDATE ON hasta_anamnez
  FOR EACH ROW EXECUTE FUNCTION hasta_hassas_denetim_bilgisi_ata();

DROP TRIGGER IF EXISTS trg_hasta_anamnez_updated_at ON hasta_anamnez;
CREATE TRIGGER trg_hasta_anamnez_updated_at
  BEFORE UPDATE ON hasta_anamnez
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hasta_anamnez_audit ON hasta_anamnez;
CREATE TRIGGER trg_hasta_anamnez_audit
  AFTER INSERT OR UPDATE OR DELETE ON hasta_anamnez
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

-- RLS: klinik_admin/resepsiyon/terapist — mevcut hasta_hassas anamnez
-- düzenleme yetki modeliyle (anamnezGuncelle action) aynı. hasta_hedef'in
-- daha dar (sadece terapist+klinik_admin) modelinden BİLİNÇLİ OLARAK farklı,
-- çünkü resepsiyon ilk kayıtta şikayeti not edebilmeli. Portal'a (hasta) hiç
-- açılmıyor — bu klinik/terapist tarafı bir kayıt, hasta_hedef gibi hastaya
-- gösterilen bir kavram değil.
DROP POLICY IF EXISTS "hasta_anamnez_select_klinik" ON hasta_anamnez;
CREATE POLICY "hasta_anamnez_select_klinik" ON hasta_anamnez
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "hasta_anamnez_ekle" ON hasta_anamnez;
CREATE POLICY "hasta_anamnez_ekle" ON hasta_anamnez
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- Kayıtlar düzenlenebilir (örn. durum='cozuldu' işaretlemek için) ama
-- BİLİNÇLİ OLARAK bir DELETE policy'si YOK — "her şikayetin takibi
-- yapılması gerekir" isteğiyle tutarlı append-only bir kayıt listesi
-- (hasta_bakiye_hareket/seans notu ile aynı felsefe); silme ihtiyacı
-- çıkarsa durum alanı kullanılmalı.
DROP POLICY IF EXISTS "hasta_anamnez_guncelle" ON hasta_anamnez;
CREATE POLICY "hasta_anamnez_guncelle" ON hasta_anamnez
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_anamnez' ORDER BY ordinal_position;
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'hasta_anamnez'::regclass AND NOT tgisinternal ORDER BY 1;
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'hasta_anamnez' ORDER BY 1;
