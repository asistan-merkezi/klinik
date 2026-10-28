-- Tedavi Tanımları > "İşlem Tanımlama" kataloğu: klinik bazlı, tekrar
-- kullanılabilir işlem adımı şablonları (ad + uygulayacak kişi/pozisyon +
-- süre). "Yeni Tedavi Ekle"deki işlem adımı satırları artık buradan seçilip
-- ön doldurulabiliyor — seçim yalnız formu doldurur, islem_tanimi_adim'e FK
-- YOK (şablon sonradan değişse/silinse bile mevcut tedavi adımları etkilenmez,
-- tıpkı "Gerekli Cihaz"ın cihaz kataloğunu serbestçe referans alması gibi).

CREATE TABLE IF NOT EXISTS islem_adimi_sablonu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  uygulayici_pozisyon_id uuid REFERENCES pozisyonlar(id) ON DELETE SET NULL,
  sure_dakika integer CHECK (sure_dakika IS NULL OR sure_dakika >= 1),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, ad)
);
ALTER TABLE islem_adimi_sablonu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_adimi_sablonu_klinik_id ON islem_adimi_sablonu(klinik_id);

DROP TRIGGER IF EXISTS trg_islem_adimi_sablonu_updated_at ON islem_adimi_sablonu;
CREATE TRIGGER trg_islem_adimi_sablonu_updated_at
  BEFORE UPDATE ON islem_adimi_sablonu FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP POLICY IF EXISTS "islem_adimi_sablonu_select_klinik" ON islem_adimi_sablonu;
CREATE POLICY "islem_adimi_sablonu_select_klinik" ON islem_adimi_sablonu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

-- Yalnız klinik_admin yönetir (Tedavi Tanımları sayfasındaki mevcut
-- duzenlenebilir = rol === 'klinik_admin' kısıtıyla birebir).
DROP POLICY IF EXISTS "islem_adimi_sablonu_yonet_admin" ON islem_adimi_sablonu;
CREATE POLICY "islem_adimi_sablonu_yonet_admin" ON islem_adimi_sablonu
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT policyname FROM pg_policies WHERE tablename = 'islem_adimi_sablonu';
