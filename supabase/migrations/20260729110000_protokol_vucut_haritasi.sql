-- Müşteri Detay 7-sekme UI'ı için eksik veri kaynaklarını tamamlar:
-- 1) musteri_vucut_haritasi_isareti — 2D anatomik harita işaretleri
--    (CLAUDE.md'deki seans_notu.vücut_haritası JSON konseptinin ilişkisel karşılığı)
-- 2) musteri_protokol — hastaya atanmış tedavi protokolü; islem_kontrendikasyon
--    kontrolü burada DB SEVİYESİNDE (trigger) uygulanır — sadece uygulama
--    katmanına güvenilmez (security-baseline): blok varsa kayıt tamamen
--    reddedilir, uyari varsa uyari_onaylandi_mi=true olmadan reddedilir.
-- 3) olcek_tanimi'ye ROM (Eklem Hareket Açıklığı) satırı eklenir.
-- İdempotent, tek blok.

-- ============================================================
-- 1) musteri_vucut_haritasi_isareti
-- ============================================================
CREATE TABLE IF NOT EXISTS musteri_vucut_haritasi_isareti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  randevu_id uuid REFERENCES randevu(id) ON DELETE SET NULL,
  bolge text NOT NULL,
  x numeric(5, 4) NOT NULL CHECK (x >= 0 AND x <= 1),
  y numeric(5, 4) NOT NULL CHECK (y >= 0 AND y <= 1),
  severity integer CHECK (severity BETWEEN 0 AND 10),
  not_metni text,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_vucut_haritasi_isareti ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_vucut_haritasi_isareti_klinik_id ON musteri_vucut_haritasi_isareti(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_vucut_haritasi_isareti_musteri_id ON musteri_vucut_haritasi_isareti(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_vucut_haritasi_isareti_klinik_id ON musteri_vucut_haritasi_isareti;
CREATE TRIGGER trg_musteri_vucut_haritasi_isareti_klinik_id
  BEFORE INSERT ON musteri_vucut_haritasi_isareti
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP TRIGGER IF EXISTS trg_musteri_vucut_haritasi_isareti_updated_at ON musteri_vucut_haritasi_isareti;
CREATE TRIGGER trg_musteri_vucut_haritasi_isareti_updated_at
  BEFORE UPDATE ON musteri_vucut_haritasi_isareti FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_musteri_vucut_haritasi_isareti_audit ON musteri_vucut_haritasi_isareti;
CREATE TRIGGER trg_musteri_vucut_haritasi_isareti_audit
  AFTER INSERT OR UPDATE OR DELETE ON musteri_vucut_haritasi_isareti
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_vucut_haritasi_isareti_select_klinik" ON musteri_vucut_haritasi_isareti;
CREATE POLICY "musteri_vucut_haritasi_isareti_select_klinik" ON musteri_vucut_haritasi_isareti
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_vucut_haritasi_isareti_select_portal" ON musteri_vucut_haritasi_isareti;
CREATE POLICY "musteri_vucut_haritasi_isareti_select_portal" ON musteri_vucut_haritasi_isareti
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_vucut_haritasi_isareti_yonet_terapist_admin" ON musteri_vucut_haritasi_isareti;
CREATE POLICY "musteri_vucut_haritasi_isareti_yonet_terapist_admin" ON musteri_vucut_haritasi_isareti
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

-- ============================================================
-- 2) musteri_protokol (+ DB seviyesinde kontrendikasyon kontrolü)
-- ============================================================
CREATE TABLE IF NOT EXISTS musteri_protokol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE RESTRICT,
  atayan_terapist_id uuid REFERENCES terapist(id) ON DELETE SET NULL,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'tamamlandi', 'iptal')),
  baslangic_tarihi date NOT NULL DEFAULT current_date,
  notlar text,
  uyari_onaylandi_mi boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_protokol ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_protokol_klinik_id ON musteri_protokol(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_protokol_musteri_id ON musteri_protokol(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_protokol_klinik_id ON musteri_protokol;
CREATE TRIGGER trg_musteri_protokol_klinik_id
  BEFORE INSERT ON musteri_protokol
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

-- Kontrendikasyon kontrolü: blok -> tamamen reddet, uyari -> onaysız reddet.
CREATE OR REPLACE FUNCTION musteri_protokol_kontrendikasyon_kontrol()
RETURNS trigger AS $$
DECLARE
  v_risk_bayraklari jsonb;
  v_blok_var boolean;
  v_uyari_var boolean;
BEGIN
  SELECT risk_bayraklari INTO v_risk_bayraklari FROM musteri WHERE id = NEW.musteri_id;

  SELECT EXISTS (
    SELECT 1 FROM islem_kontrendikasyon ik
    WHERE ik.islem_tanimi_id = NEW.islem_tanimi_id
      AND ik.uyari_seviyesi = 'blok'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_risk_bayraklari, '[]'::jsonb)) rb
        WHERE rb->>'tip' = ik.risk_tipi
      )
  ) INTO v_blok_var;

  IF v_blok_var THEN
    RAISE EXCEPTION 'kontrendikasyon_blok';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM islem_kontrendikasyon ik
    WHERE ik.islem_tanimi_id = NEW.islem_tanimi_id
      AND ik.uyari_seviyesi = 'uyari'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_risk_bayraklari, '[]'::jsonb)) rb
        WHERE rb->>'tip' = ik.risk_tipi
      )
  ) INTO v_uyari_var;

  IF v_uyari_var AND NOT COALESCE(NEW.uyari_onaylandi_mi, false) THEN
    RAISE EXCEPTION 'kontrendikasyon_uyari_onay_gerekli';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_musteri_protokol_kontrendikasyon ON musteri_protokol;
CREATE TRIGGER trg_musteri_protokol_kontrendikasyon
  BEFORE INSERT OR UPDATE OF islem_tanimi_id, uyari_onaylandi_mi ON musteri_protokol
  FOR EACH ROW EXECUTE FUNCTION musteri_protokol_kontrendikasyon_kontrol();

DROP TRIGGER IF EXISTS trg_musteri_protokol_updated_at ON musteri_protokol;
CREATE TRIGGER trg_musteri_protokol_updated_at
  BEFORE UPDATE ON musteri_protokol FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_musteri_protokol_audit ON musteri_protokol;
CREATE TRIGGER trg_musteri_protokol_audit
  AFTER INSERT OR UPDATE OR DELETE ON musteri_protokol
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_protokol_select_klinik" ON musteri_protokol;
CREATE POLICY "musteri_protokol_select_klinik" ON musteri_protokol
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_protokol_select_portal" ON musteri_protokol;
CREATE POLICY "musteri_protokol_select_portal" ON musteri_protokol
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_protokol_yonet_terapist_admin" ON musteri_protokol;
CREATE POLICY "musteri_protokol_yonet_terapist_admin" ON musteri_protokol
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

-- ============================================================
-- 3) ROM ölçek tanımı (platform geneli; max_skor NULL — eklem/harekete göre
-- normal aralık değişir, hangi eklem/hareket olduğu musteri_olcum.cevaplar
-- içinde tutulur, örn. {"eklem": "omuz", "hareket": "fleksiyon", "deger_derece": 120})
-- ============================================================
INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'ROM', 'Eklem Hareket Açıklığı (ROM)',
  '{"tip": "serbest_derece", "not": "Ölçülen eklem/hareket ve derece değeri her ölçümde cevaplar alanında (eklem, hareket, deger_derece) tutulur; normal aralık eklem/harekete göre değişir, sabit değildir."}'::jsonb,
  '{"tip": "tekil_deger", "alan": "deger_derece"}'::jsonb,
  0, NULL, 'yuksek_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN
--   ('musteri_vucut_haritasi_isareti', 'musteri_protokol');
-- SELECT kod FROM olcek_tanimi WHERE kod = 'ROM';
-- SELECT proname FROM pg_proc WHERE proname = 'musteri_protokol_kontrendikasyon_kontrol';
