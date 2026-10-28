-- Müşteri Takibi modülü: risk/kontrendikasyon, hedef+ölçek+ölçüm, ev egzersiz
-- programı, seans checklist, iletişim/anket/ön-form, müşteri ilişki+sigorta,
-- belge versiyonlama + onam/foto, özet view + ilerleme materialized view.
-- İdempotent, tek blok. Mevcut konvansiyonlarla tutarlı: current_klinik_id()/
-- current_rol()/is_super_admin(), set_updated_at(), klinik_id'nin ilişkili
-- tablodan trigger ile türetilmesi (musteri_hassas/randevu_iptal_talebi
-- deseniyle aynı — client'ın gönderdiği klinik_id'ye güvenilmez).
--
-- Not (kapsam kararları, kullanıcı onayıyla):
-- - musteri_belge ve musteri_onam CLAUDE.md'de tanımlı ama hiçbir migration'da
--   CREATE edilmemişti; bu migration'da ilk kez oluşturuluyorlar.
-- - bildirim_log hiç yoktu; ayrı tablo açmak yerine tek musteri_iletisim_log
--   tutuluyor (ileride otomatik WhatsApp/SMS gönderimleri de buraya yazılabilir).
-- - musteri.risk_bayraklari: terapist de ekleyebilsin istendi — RLS'e ek bir
--   UPDATE policy + "sadece risk_bayraklari değişebilir" trigger'ı eklendi.
-- - v_musteri_ozet.bakiye: "kredi - borc" varsayımıyla hesaplanıyor (odeme/iade
--   satırları zaten ilgili ödemenin audit-trail kaydı, cari bakiyeyi
--   etkilemiyor varsayıldı) — CLAUDE.md bu kavramın henüz UI'da net olmadığını
--   belirtiyor, yanlışsa bu view kolayca güncellenebilir.
-- - QuickDASH/Oswestry/Berg/SF-36 telifli standardize ölçüm araçları: seed'de
--   gerçek soru metinleri uydurulmadı, sadece skorlama iskeleti dolduruldu
--   (bkz. seed dosyası).
-- - mv_musteri_ilerleme bir MATERIALIZED VIEW; Postgres RLS matview'lara
--   doğrudan uygulanamıyor (yalnızca "regular table"lara), bu yüzden ham
--   matview client rollerinden REVOKE edildi ve üstüne klinik filtresi
--   uygulayan bir v_musteri_ilerleme VIEW'ı eklendi — uygulama SADECE
--   v_musteri_ilerleme'yi sorgulamalı.
-- - pg_cron altyapısı projede henüz kurulmadığı için matview'ın otomatik
--   REFRESH'i bu turda kurulmuyor (manuel `REFRESH MATERIALIZED VIEW
--   mv_musteri_ilerleme;`).

-- 0) Ortak: ilişkili tablodan klinik_id türeten generic trigger fonksiyonu
-- (musteri_hassas_klinik_id_ata / randevu_iptal_talebi_klinik_id_ata ile aynı
-- deseni tekrar tekrar yazmak yerine parametrik tek fonksiyon).
CREATE OR REPLACE FUNCTION derive_klinik_id_from_parent()
RETURNS trigger AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_parent_id_col text := TG_ARGV[1];
  v_parent_id uuid;
BEGIN
  v_parent_id := (to_jsonb(NEW) ->> v_parent_id_col)::uuid;
  EXECUTE format('SELECT klinik_id FROM %I WHERE id = $1', v_parent_table)
    INTO NEW.klinik_id
    USING v_parent_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ortak: tıbbi veri içeren tablolar için generic audit_log yazıcı trigger.
CREATE OR REPLACE FUNCTION audit_log_yaz()
RETURNS trigger AS $$
DECLARE
  v_klinik_id uuid;
  v_hedef_id uuid;
BEGIN
  v_klinik_id := COALESCE(NEW.klinik_id, OLD.klinik_id);
  v_hedef_id := COALESCE(NEW.id, OLD.id);

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (
    v_klinik_id,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_hedef_id,
    to_jsonb(COALESCE(NEW, OLD))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- A) RİSK & GÜVENLİK
-- ============================================================

-- A1) musteri.risk_bayraklari
ALTER TABLE musteri ADD COLUMN IF NOT EXISTS risk_bayraklari jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Terapist normalde musteri tablosuna hiç UPDATE hakkına sahip değil
-- (musteri_yonet_resepsiyon_admin sadece klinik_admin/resepsiyon). Kullanıcı
-- kararıyla terapist'in risk bayrağı ekleyebilmesi istendi: ek bir UPDATE
-- policy açılıyor, ama trigger ile SADECE risk_bayraklari değişebileceği
-- garanti ediliyor (terapist başka bir alanı değiştiremez).
CREATE OR REPLACE FUNCTION musteri_terapist_sadece_risk_guncelle()
RETURNS trigger AS $$
BEGIN
  IF current_rol() = 'terapist' THEN
    IF (to_jsonb(NEW) - 'risk_bayraklari' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'risk_bayraklari' - 'updated_at') THEN
      RAISE EXCEPTION 'terapist_sadece_risk_bayraklari_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_musteri_terapist_risk_kisitla ON musteri;
CREATE TRIGGER trg_musteri_terapist_risk_kisitla
  BEFORE UPDATE ON musteri
  FOR EACH ROW EXECUTE FUNCTION musteri_terapist_sadece_risk_guncelle();

DROP TRIGGER IF EXISTS trg_musteri_risk_audit ON musteri;
CREATE TRIGGER trg_musteri_risk_audit
  AFTER UPDATE ON musteri
  FOR EACH ROW
  WHEN (OLD.risk_bayraklari IS DISTINCT FROM NEW.risk_bayraklari)
  EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_update_terapist_risk" ON musteri;
CREATE POLICY "musteri_update_terapist_risk" ON musteri
  FOR UPDATE USING (klinik_id = current_klinik_id() AND current_rol() = 'terapist')
  WITH CHECK (klinik_id = current_klinik_id() AND current_rol() = 'terapist');

-- A2) islem_kontrendikasyon
CREATE TABLE IF NOT EXISTS islem_kontrendikasyon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE CASCADE,
  risk_tipi text NOT NULL CHECK (risk_tipi IN
    ('alerji', 'kalp_pili', 'kan_sulandirici', 'dusme_riski', 'hamilelik', 'diyabet', 'epilepsi', 'metal_implant', 'diger')),
  uyari_seviyesi text NOT NULL CHECK (uyari_seviyesi IN ('blok', 'uyari')),
  mesaj text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE islem_kontrendikasyon ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_kontrendikasyon_klinik_id ON islem_kontrendikasyon(klinik_id);
CREATE INDEX IF NOT EXISTS idx_islem_kontrendikasyon_islem_id ON islem_kontrendikasyon(islem_tanimi_id);

DROP TRIGGER IF EXISTS trg_islem_kontrendikasyon_klinik_id ON islem_kontrendikasyon;
CREATE TRIGGER trg_islem_kontrendikasyon_klinik_id
  BEFORE INSERT ON islem_kontrendikasyon
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('islem_tanimi', 'islem_tanimi_id');

DROP POLICY IF EXISTS "islem_kontrendikasyon_select_klinik" ON islem_kontrendikasyon;
CREATE POLICY "islem_kontrendikasyon_select_klinik" ON islem_kontrendikasyon
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "islem_kontrendikasyon_yonet_admin" ON islem_kontrendikasyon;
CREATE POLICY "islem_kontrendikasyon_yonet_admin" ON islem_kontrendikasyon
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ============================================================
-- B) HEDEF & ÖLÇÜM
-- ============================================================

-- B3) musteri_hedef
CREATE TABLE IF NOT EXISTS musteri_hedef (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  hedef_tipi text NOT NULL CHECK (hedef_tipi IN ('vas', 'rom', 'fonksiyonel', 'serbest')),
  hedef_metrik text NOT NULL,
  baslangic_deger numeric(10, 2),
  hedef_deger numeric(10, 2),
  hedef_tarihi date,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'ulasildi', 'basarisiz', 'iptal')),
  olusturan_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  notlar text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_hedef ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_hedef_klinik_id ON musteri_hedef(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_hedef_musteri_id ON musteri_hedef(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_hedef_klinik_id ON musteri_hedef;
CREATE TRIGGER trg_musteri_hedef_klinik_id
  BEFORE INSERT ON musteri_hedef
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP TRIGGER IF EXISTS trg_musteri_hedef_audit ON musteri_hedef;
CREATE TRIGGER trg_musteri_hedef_audit
  AFTER INSERT OR UPDATE OR DELETE ON musteri_hedef
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_hedef_select_klinik" ON musteri_hedef;
CREATE POLICY "musteri_hedef_select_klinik" ON musteri_hedef
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_hedef_yonet_terapist_admin" ON musteri_hedef;
CREATE POLICY "musteri_hedef_yonet_terapist_admin" ON musteri_hedef
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

-- B4) olcek_tanimi (klinik_id NULL = platform geneli şablon, egzersiz_kutuphanesi
-- ile aynı desen; klinikler kendi özel ölçeklerini de ekleyebilir)
CREATE TABLE IF NOT EXISTS olcek_tanimi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,
  kod text NOT NULL,
  ad text NOT NULL,
  soru_semasi jsonb NOT NULL DEFAULT '[]'::jsonb,
  skorlama_kurali jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_skor numeric(6, 2),
  max_skor numeric(6, 2),
  yorum_yonu text NOT NULL CHECK (yorum_yonu IN ('yuksek_iyi', 'dusuk_iyi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE olcek_tanimi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_olcek_tanimi_klinik_id ON olcek_tanimi(klinik_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_olcek_tanimi_kod_platform ON olcek_tanimi(kod) WHERE klinik_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_olcek_tanimi_kod_klinik ON olcek_tanimi(klinik_id, kod) WHERE klinik_id IS NOT NULL;

DROP POLICY IF EXISTS "olcek_tanimi_select" ON olcek_tanimi;
CREATE POLICY "olcek_tanimi_select" ON olcek_tanimi
  FOR SELECT USING (klinik_id = current_klinik_id() OR klinik_id IS NULL OR is_super_admin());

DROP POLICY IF EXISTS "olcek_tanimi_yonet" ON olcek_tanimi;
CREATE POLICY "olcek_tanimi_yonet" ON olcek_tanimi
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

-- B5) musteri_olcum
CREATE TABLE IF NOT EXISTS musteri_olcum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  randevu_id uuid REFERENCES randevu(id) ON DELETE SET NULL,
  olcek_tanimi_id uuid NOT NULL REFERENCES olcek_tanimi(id) ON DELETE RESTRICT,
  cevaplar jsonb NOT NULL DEFAULT '{}'::jsonb,
  hesaplanan_skor numeric(6, 2),
  olcum_tarihi timestamptz NOT NULL DEFAULT now(),
  giren_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_olcum ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_olcum_klinik_id ON musteri_olcum(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_olcum_musteri_id ON musteri_olcum(musteri_id, olcum_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_musteri_olcum_olcek_id ON musteri_olcum(olcek_tanimi_id);

DROP TRIGGER IF EXISTS trg_musteri_olcum_klinik_id ON musteri_olcum;
CREATE TRIGGER trg_musteri_olcum_klinik_id
  BEFORE INSERT ON musteri_olcum
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP TRIGGER IF EXISTS trg_musteri_olcum_audit ON musteri_olcum;
CREATE TRIGGER trg_musteri_olcum_audit
  AFTER INSERT OR UPDATE OR DELETE ON musteri_olcum
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_olcum_select_klinik" ON musteri_olcum;
CREATE POLICY "musteri_olcum_select_klinik" ON musteri_olcum
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_olcum_yonet_terapist_admin" ON musteri_olcum;
CREATE POLICY "musteri_olcum_yonet_terapist_admin" ON musteri_olcum
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

-- ============================================================
-- C) EV EGZERSİZ PROGRAMI
-- ============================================================

-- C6) egzersiz_kutuphanesi (klinik_id NULL = platform geneli)
CREATE TABLE IF NOT EXISTS egzersiz_kutuphanesi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  aciklama text,
  bolge text,
  video_url text,
  gorsel_url text,
  varsayilan_set integer CHECK (varsayilan_set > 0),
  varsayilan_tekrar integer CHECK (varsayilan_tekrar > 0),
  varsayilan_sure_sn integer CHECK (varsayilan_sure_sn > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE egzersiz_kutuphanesi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_egzersiz_kutuphanesi_klinik_id ON egzersiz_kutuphanesi(klinik_id);

DROP POLICY IF EXISTS "egzersiz_kutuphanesi_select" ON egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_kutuphanesi_select" ON egzersiz_kutuphanesi
  FOR SELECT USING (klinik_id = current_klinik_id() OR klinik_id IS NULL OR is_super_admin());

DROP POLICY IF EXISTS "egzersiz_kutuphanesi_yonet" ON egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_kutuphanesi_yonet" ON egzersiz_kutuphanesi
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

-- C7) ev_egzersiz_programi
CREATE TABLE IF NOT EXISTS ev_egzersiz_programi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  ad text NOT NULL,
  baslangic_tarihi date NOT NULL DEFAULT current_date,
  bitis_tarihi date,
  atayan_terapist_id uuid REFERENCES terapist(id) ON DELETE SET NULL,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'tamamlandi', 'iptal')),
  notlar text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bitis_tarihi IS NULL OR bitis_tarihi >= baslangic_tarihi)
);
ALTER TABLE ev_egzersiz_programi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_programi_klinik_id ON ev_egzersiz_programi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_programi_musteri_id ON ev_egzersiz_programi(musteri_id);

DROP TRIGGER IF EXISTS trg_ev_egzersiz_programi_klinik_id ON ev_egzersiz_programi;
CREATE TRIGGER trg_ev_egzersiz_programi_klinik_id
  BEFORE INSERT ON ev_egzersiz_programi
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP POLICY IF EXISTS "ev_egzersiz_programi_select_klinik" ON ev_egzersiz_programi;
CREATE POLICY "ev_egzersiz_programi_select_klinik" ON ev_egzersiz_programi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "ev_egzersiz_programi_select_portal" ON ev_egzersiz_programi;
CREATE POLICY "ev_egzersiz_programi_select_portal" ON ev_egzersiz_programi
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "ev_egzersiz_programi_yonet_terapist_admin" ON ev_egzersiz_programi;
CREATE POLICY "ev_egzersiz_programi_yonet_terapist_admin" ON ev_egzersiz_programi
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

-- C8) ev_egzersiz_kalemi
CREATE TABLE IF NOT EXISTS ev_egzersiz_kalemi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES ev_egzersiz_programi(id) ON DELETE CASCADE,
  egzersiz_id uuid NOT NULL REFERENCES egzersiz_kutuphanesi(id) ON DELETE RESTRICT,
  "set" integer CHECK ("set" > 0),
  tekrar integer CHECK (tekrar > 0),
  sure_sn integer CHECK (sure_sn > 0),
  gun_sikligi text,
  sira integer NOT NULL DEFAULT 1,
  ozel_not text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ev_egzersiz_kalemi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_kalemi_program_id ON ev_egzersiz_kalemi(program_id);
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_kalemi_egzersiz_id ON ev_egzersiz_kalemi(egzersiz_id);

DROP POLICY IF EXISTS "ev_egzersiz_kalemi_select_klinik" ON ev_egzersiz_kalemi;
CREATE POLICY "ev_egzersiz_kalemi_select_klinik" ON ev_egzersiz_kalemi
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_kalemi.program_id AND ep.klinik_id = current_klinik_id())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "ev_egzersiz_kalemi_select_portal" ON ev_egzersiz_kalemi;
CREATE POLICY "ev_egzersiz_kalemi_select_portal" ON ev_egzersiz_kalemi
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_kalemi.program_id AND ep.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "ev_egzersiz_kalemi_yonet_terapist_admin" ON ev_egzersiz_kalemi;
CREATE POLICY "ev_egzersiz_kalemi_yonet_terapist_admin" ON ev_egzersiz_kalemi
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ev_egzersiz_programi ep
      WHERE ep.id = ev_egzersiz_kalemi.program_id
        AND ep.klinik_id = current_klinik_id()
        AND current_rol() IN ('terapist', 'klinik_admin')
    ) OR is_super_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ev_egzersiz_programi ep
      WHERE ep.id = ev_egzersiz_kalemi.program_id
        AND ep.klinik_id = current_klinik_id()
        AND current_rol() IN ('terapist', 'klinik_admin')
    ) OR is_super_admin()
  );

-- C9) ev_egzersiz_takip (hasta portaldan "yaptım" işaretler)
CREATE TABLE IF NOT EXISTS ev_egzersiz_takip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES ev_egzersiz_programi(id) ON DELETE CASCADE,
  kalem_id uuid NOT NULL REFERENCES ev_egzersiz_kalemi(id) ON DELETE CASCADE,
  tarih date NOT NULL DEFAULT current_date,
  yapildi boolean NOT NULL DEFAULT false,
  hasta_notu text,
  agri_skoru integer CHECK (agri_skoru BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kalem_id, tarih)
);
ALTER TABLE ev_egzersiz_takip ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_takip_klinik_id ON ev_egzersiz_takip(klinik_id);
CREATE INDEX IF NOT EXISTS idx_ev_egzersiz_takip_program_id ON ev_egzersiz_takip(program_id);

DROP TRIGGER IF EXISTS trg_ev_egzersiz_takip_klinik_id ON ev_egzersiz_takip;
CREATE TRIGGER trg_ev_egzersiz_takip_klinik_id
  BEFORE INSERT ON ev_egzersiz_takip
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('ev_egzersiz_programi', 'program_id');

DROP TRIGGER IF EXISTS trg_ev_egzersiz_takip_audit ON ev_egzersiz_takip;
CREATE TRIGGER trg_ev_egzersiz_takip_audit
  AFTER INSERT OR UPDATE OR DELETE ON ev_egzersiz_takip
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "ev_egzersiz_takip_select_klinik" ON ev_egzersiz_takip;
CREATE POLICY "ev_egzersiz_takip_select_klinik" ON ev_egzersiz_takip
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "ev_egzersiz_takip_select_portal" ON ev_egzersiz_takip;
CREATE POLICY "ev_egzersiz_takip_select_portal" ON ev_egzersiz_takip
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_takip.program_id AND ep.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "ev_egzersiz_takip_yonet_terapist_admin" ON ev_egzersiz_takip;
CREATE POLICY "ev_egzersiz_takip_yonet_terapist_admin" ON ev_egzersiz_takip
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('terapist', 'klinik_admin')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "ev_egzersiz_takip_portal_isaretle" ON ev_egzersiz_takip;
CREATE POLICY "ev_egzersiz_takip_portal_isaretle" ON ev_egzersiz_takip
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_takip.program_id AND ep.musteri_id = current_musteri_id())
  );

DROP POLICY IF EXISTS "ev_egzersiz_takip_portal_guncelle" ON ev_egzersiz_takip;
CREATE POLICY "ev_egzersiz_takip_portal_guncelle" ON ev_egzersiz_takip
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_takip.program_id AND ep.musteri_id = current_musteri_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM ev_egzersiz_programi ep WHERE ep.id = ev_egzersiz_takip.program_id AND ep.musteri_id = current_musteri_id())
  );

-- Portal: hastanın kendi programındaki egzersizlerin künyesini (video/açıklama)
-- görmesi (ev_egzersiz_kalemi/ev_egzersiz_programi'den sonra tanımlanmalı).
DROP POLICY IF EXISTS "egzersiz_kutuphanesi_select_portal" ON egzersiz_kutuphanesi;
CREATE POLICY "egzersiz_kutuphanesi_select_portal" ON egzersiz_kutuphanesi
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ev_egzersiz_kalemi ek
      JOIN ev_egzersiz_programi ep ON ep.id = ek.program_id
      WHERE ek.egzersiz_id = egzersiz_kutuphanesi.id AND ep.musteri_id = current_musteri_id()
    )
  );

-- ============================================================
-- D) SEANS KALİTESİ
-- ============================================================

-- D10) seans_checklist_sablonu
CREATE TABLE IF NOT EXISTS seans_checklist_sablonu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  maddeler jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seans_checklist_sablonu ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_seans_checklist_sablonu_klinik_id ON seans_checklist_sablonu(klinik_id);

DROP POLICY IF EXISTS "seans_checklist_sablonu_select_klinik" ON seans_checklist_sablonu;
CREATE POLICY "seans_checklist_sablonu_select_klinik" ON seans_checklist_sablonu
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "seans_checklist_sablonu_yonet_admin" ON seans_checklist_sablonu;
CREATE POLICY "seans_checklist_sablonu_yonet_admin" ON seans_checklist_sablonu
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- D11) randevu_checklist
CREATE TABLE IF NOT EXISTS randevu_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL REFERENCES randevu(id) ON DELETE CASCADE,
  sablon_id uuid NOT NULL REFERENCES seans_checklist_sablonu(id) ON DELETE RESTRICT,
  cevaplar jsonb NOT NULL DEFAULT '{}'::jsonb,
  tamamlanma_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (randevu_id, sablon_id)
);
ALTER TABLE randevu_checklist ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_randevu_checklist_klinik_id ON randevu_checklist(klinik_id);
CREATE INDEX IF NOT EXISTS idx_randevu_checklist_randevu_id ON randevu_checklist(randevu_id);

DROP TRIGGER IF EXISTS trg_randevu_checklist_klinik_id ON randevu_checklist;
CREATE TRIGGER trg_randevu_checklist_klinik_id
  BEFORE INSERT ON randevu_checklist
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('randevu', 'randevu_id');

DROP POLICY IF EXISTS "randevu_checklist_select_klinik" ON randevu_checklist;
CREATE POLICY "randevu_checklist_select_klinik" ON randevu_checklist
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_checklist_yonet_admin" ON randevu_checklist;
CREATE POLICY "randevu_checklist_yonet_admin" ON randevu_checklist
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "randevu_checklist_yonet_terapist_kendi" ON randevu_checklist;
CREATE POLICY "randevu_checklist_yonet_terapist_kendi" ON randevu_checklist
  FOR ALL USING (
    klinik_id = current_klinik_id()
    AND EXISTS (
      SELECT 1 FROM randevu r
      JOIN terapist t ON t.id = r.terapist_id
      JOIN personel p ON p.id = t.personel_id
      WHERE r.id = randevu_checklist.randevu_id AND p.kullanici_id = auth.uid()
    )
  )
  WITH CHECK (
    klinik_id = current_klinik_id()
    AND EXISTS (
      SELECT 1 FROM randevu r
      JOIN terapist t ON t.id = r.terapist_id
      JOIN personel p ON p.id = t.personel_id
      WHERE r.id = randevu_checklist.randevu_id AND p.kullanici_id = auth.uid()
    )
  );

-- ============================================================
-- E) İLETİŞİM & GERİ BİLDİRİM
-- ============================================================

-- E12) musteri_iletisim_log (bildirim_log henüz yok — manuel + gelecekte otomatik
-- gönderimler de tek tabloda; ayrı bildirim_log açılmadı, kullanıcı onayı).
CREATE TABLE IF NOT EXISTS musteri_iletisim_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  kanal text NOT NULL CHECK (kanal IN ('whatsapp', 'sms', 'email', 'telefon', 'portal')),
  yon text NOT NULL CHECK (yon IN ('giden', 'gelen')),
  icerik text,
  ilgili_randevu_id uuid REFERENCES randevu(id) ON DELETE SET NULL,
  personel_id uuid REFERENCES personel(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_iletisim_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_iletisim_log_klinik_id ON musteri_iletisim_log(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_iletisim_log_musteri_id ON musteri_iletisim_log(musteri_id, olusturma_tarihi DESC);

DROP TRIGGER IF EXISTS trg_musteri_iletisim_log_klinik_id ON musteri_iletisim_log;
CREATE TRIGGER trg_musteri_iletisim_log_klinik_id
  BEFORE INSERT ON musteri_iletisim_log
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP POLICY IF EXISTS "musteri_iletisim_log_select_klinik" ON musteri_iletisim_log;
CREATE POLICY "musteri_iletisim_log_select_klinik" ON musteri_iletisim_log
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_iletisim_log_ekle_klinik" ON musteri_iletisim_log;
CREATE POLICY "musteri_iletisim_log_ekle_klinik" ON musteri_iletisim_log
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  );

-- E13) musteri_anket
CREATE TABLE IF NOT EXISTS musteri_anket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  anket_tipi text NOT NULL CHECK (anket_tipi IN ('nps', 'memnuniyet')),
  tetikleyici text CHECK (tetikleyici IN ('paket_bitis', 'seans_sayisi')),
  puan integer CHECK (puan >= 0),
  yorum text,
  gonderim_tarihi timestamptz NOT NULL DEFAULT now(),
  cevap_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_anket ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_anket_klinik_id ON musteri_anket(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_anket_musteri_id ON musteri_anket(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_anket_klinik_id ON musteri_anket;
CREATE TRIGGER trg_musteri_anket_klinik_id
  BEFORE INSERT ON musteri_anket
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP POLICY IF EXISTS "musteri_anket_select_klinik" ON musteri_anket;
CREATE POLICY "musteri_anket_select_klinik" ON musteri_anket
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_anket_select_portal" ON musteri_anket;
CREATE POLICY "musteri_anket_select_portal" ON musteri_anket
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_anket_ekle_klinik" ON musteri_anket;
CREATE POLICY "musteri_anket_ekle_klinik" ON musteri_anket
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_anket_portal_yanitla" ON musteri_anket;
CREATE POLICY "musteri_anket_portal_yanitla" ON musteri_anket
  FOR UPDATE USING (musteri_id = current_musteri_id() AND cevap_tarihi IS NULL)
  WITH CHECK (musteri_id = current_musteri_id());

-- E14) randevu_on_form (hasta portaldan doldurur)
CREATE TABLE IF NOT EXISTS randevu_on_form (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  randevu_id uuid NOT NULL UNIQUE REFERENCES randevu(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  agri_skoru integer CHECK (agri_skoru BETWEEN 0 AND 10),
  sikayet_guncelleme text,
  ilac_degisikligi text,
  doldurma_tarihi timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE randevu_on_form ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_randevu_on_form_klinik_id ON randevu_on_form(klinik_id);

DROP TRIGGER IF EXISTS trg_1_randevu_on_form_klinik_id ON randevu_on_form;
CREATE TRIGGER trg_1_randevu_on_form_klinik_id
  BEFORE INSERT ON randevu_on_form
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('randevu', 'randevu_id');

CREATE OR REPLACE FUNCTION randevu_on_form_dogrula()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM randevu WHERE id = NEW.randevu_id AND musteri_id = NEW.musteri_id) THEN
    RAISE EXCEPTION 'musteri_randevu_uyusmuyor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_2_randevu_on_form_dogrula ON randevu_on_form;
CREATE TRIGGER trg_2_randevu_on_form_dogrula
  BEFORE INSERT OR UPDATE ON randevu_on_form
  FOR EACH ROW EXECUTE FUNCTION randevu_on_form_dogrula();

DROP TRIGGER IF EXISTS trg_randevu_on_form_audit ON randevu_on_form;
CREATE TRIGGER trg_randevu_on_form_audit
  AFTER INSERT OR UPDATE OR DELETE ON randevu_on_form
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "randevu_on_form_select_klinik" ON randevu_on_form;
CREATE POLICY "randevu_on_form_select_klinik" ON randevu_on_form
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "randevu_on_form_select_portal" ON randevu_on_form;
CREATE POLICY "randevu_on_form_select_portal" ON randevu_on_form
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "randevu_on_form_portal_doldur" ON randevu_on_form;
CREATE POLICY "randevu_on_form_portal_doldur" ON randevu_on_form
  FOR INSERT WITH CHECK (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "randevu_on_form_ekle_klinik" ON randevu_on_form;
CREATE POLICY "randevu_on_form_ekle_klinik" ON randevu_on_form
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- ============================================================
-- F) İLİŞKİ & FİNANS
-- ============================================================

-- F15) musteri_iliski
CREATE TABLE IF NOT EXISTS musteri_iliski (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  iliskili_musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  iliski_turu text NOT NULL CHECK (iliski_turu IN ('ebeveyn', 'cocuk', 'es', 'kardes', 'diger')),
  ortak_odeme boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (musteri_id <> iliskili_musteri_id),
  UNIQUE (musteri_id, iliskili_musteri_id)
);
ALTER TABLE musteri_iliski ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_iliski_klinik_id ON musteri_iliski(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_iliski_musteri_id ON musteri_iliski(musteri_id);

DROP TRIGGER IF EXISTS trg_1_musteri_iliski_klinik_id ON musteri_iliski;
CREATE TRIGGER trg_1_musteri_iliski_klinik_id
  BEFORE INSERT ON musteri_iliski
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

CREATE OR REPLACE FUNCTION musteri_iliski_klinik_dogrula()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM musteri WHERE id = NEW.iliskili_musteri_id AND klinik_id = NEW.klinik_id) THEN
    RAISE EXCEPTION 'iliskili_musteri_farkli_klinik';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_2_musteri_iliski_dogrula ON musteri_iliski;
CREATE TRIGGER trg_2_musteri_iliski_dogrula
  BEFORE INSERT OR UPDATE ON musteri_iliski
  FOR EACH ROW EXECUTE FUNCTION musteri_iliski_klinik_dogrula();

DROP POLICY IF EXISTS "musteri_iliski_select_klinik" ON musteri_iliski;
CREATE POLICY "musteri_iliski_select_klinik" ON musteri_iliski
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_iliski_yonet_resepsiyon_admin" ON musteri_iliski;
CREATE POLICY "musteri_iliski_yonet_resepsiyon_admin" ON musteri_iliski
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- F16) musteri_sigorta
CREATE TABLE IF NOT EXISTS musteri_sigorta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  kurum_adi text NOT NULL,
  police_no text,
  katilim_payi_orani numeric(5, 2) CHECK (katilim_payi_orani BETWEEN 0 AND 100),
  gecerlilik_baslangic date,
  gecerlilik_bitis date,
  fatura_kurum_adina boolean NOT NULL DEFAULT false,
  notlar text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (gecerlilik_bitis IS NULL OR gecerlilik_baslangic IS NULL OR gecerlilik_bitis >= gecerlilik_baslangic)
);
ALTER TABLE musteri_sigorta ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_sigorta_klinik_id ON musteri_sigorta(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_sigorta_musteri_id ON musteri_sigorta(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_sigorta_klinik_id ON musteri_sigorta;
CREATE TRIGGER trg_musteri_sigorta_klinik_id
  BEFORE INSERT ON musteri_sigorta
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP POLICY IF EXISTS "musteri_sigorta_select" ON musteri_sigorta;
CREATE POLICY "musteri_sigorta_select" ON musteri_sigorta
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'muhasebe')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_sigorta_yonet_resepsiyon_admin" ON musteri_sigorta;
CREATE POLICY "musteri_sigorta_yonet_resepsiyon_admin" ON musteri_sigorta
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- ============================================================
-- G) BELGE & GÖRSEL
-- ============================================================

-- G17) musteri_belge (CLAUDE.md'de tanımlıydı ama hiç CREATE edilmemişti —
-- bu turda ilk kez oluşturuluyor; versiyon_no/onceki_belge_id/is_guncel dahil).
CREATE TABLE IF NOT EXISTS musteri_belge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  belge_turu text NOT NULL CHECK (belge_turu IN ('mr', 'rontgen', 'recete', 'sevk', 'diger')),
  storage_path text NOT NULL,
  upload_tarihi timestamptz NOT NULL DEFAULT now(),
  yukleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_encrypted boolean NOT NULL DEFAULT false,
  versiyon_no integer NOT NULL DEFAULT 1 CHECK (versiyon_no > 0),
  onceki_belge_id uuid REFERENCES musteri_belge(id) ON DELETE SET NULL,
  is_guncel boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_belge ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_belge_klinik_id ON musteri_belge(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_belge_musteri_id ON musteri_belge(musteri_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_belge_guncel ON musteri_belge(musteri_id, belge_turu) WHERE is_guncel = true;

DROP TRIGGER IF EXISTS trg_musteri_belge_klinik_id ON musteri_belge;
CREATE TRIGGER trg_musteri_belge_klinik_id
  BEFORE INSERT ON musteri_belge
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP TRIGGER IF EXISTS trg_musteri_belge_audit ON musteri_belge;
CREATE TRIGGER trg_musteri_belge_audit
  AFTER INSERT OR UPDATE OR DELETE ON musteri_belge
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_belge_select_klinik" ON musteri_belge;
CREATE POLICY "musteri_belge_select_klinik" ON musteri_belge
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_belge_select_portal" ON musteri_belge;
CREATE POLICY "musteri_belge_select_portal" ON musteri_belge
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_belge_ekle_klinik" ON musteri_belge;
CREATE POLICY "musteri_belge_ekle_klinik" ON musteri_belge
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_belge_guncelle_klinik" ON musteri_belge;
CREATE POLICY "musteri_belge_guncelle_klinik" ON musteri_belge
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_belge_sil_admin" ON musteri_belge;
CREATE POLICY "musteri_belge_sil_admin" ON musteri_belge
  FOR DELETE USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- G18a) musteri_onam (CLAUDE.md'de tanımlıydı ama hiç CREATE edilmemişti;
-- musteri_foto.onam_id FK'si için de gerekli). Append-only (audit_log gibi
-- UPDATE/DELETE policy'si yok — imzalanmış onam değiştirilemez).
CREATE TABLE IF NOT EXISTS musteri_onam (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  onam_tipi text NOT NULL,
  imzalayan text NOT NULL DEFAULT 'hasta' CHECK (imzalayan IN ('hasta', 'veli')),
  imza_storage_path text NOT NULL,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  imza_tarihi timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_onam ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_onam_klinik_id ON musteri_onam(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_onam_musteri_id ON musteri_onam(musteri_id);

DROP TRIGGER IF EXISTS trg_musteri_onam_klinik_id ON musteri_onam;
CREATE TRIGGER trg_musteri_onam_klinik_id
  BEFORE INSERT ON musteri_onam
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

DROP TRIGGER IF EXISTS trg_musteri_onam_audit ON musteri_onam;
CREATE TRIGGER trg_musteri_onam_audit
  AFTER INSERT ON musteri_onam
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_onam_select_klinik" ON musteri_onam;
CREATE POLICY "musteri_onam_select_klinik" ON musteri_onam
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_onam_select_portal" ON musteri_onam;
CREATE POLICY "musteri_onam_select_portal" ON musteri_onam
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_onam_ekle_klinik" ON musteri_onam;
CREATE POLICY "musteri_onam_ekle_klinik" ON musteri_onam
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  );

-- G18b) musteri_foto (onam_id NOT NULL — onamsız fotoğraf kaydı DB seviyesinde engellenir)
CREATE TABLE IF NOT EXISTS musteri_foto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  bolge text NOT NULL,
  storage_path text NOT NULL,
  cekim_tarihi timestamptz NOT NULL DEFAULT now(),
  ceken_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  onam_id uuid NOT NULL REFERENCES musteri_onam(id) ON DELETE RESTRICT,
  etiketler jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_foto ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_foto_klinik_id ON musteri_foto(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_foto_musteri_id ON musteri_foto(musteri_id);

DROP TRIGGER IF EXISTS trg_1_musteri_foto_klinik_id ON musteri_foto;
CREATE TRIGGER trg_1_musteri_foto_klinik_id
  BEFORE INSERT ON musteri_foto
  FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('musteri', 'musteri_id');

CREATE OR REPLACE FUNCTION musteri_foto_onam_dogrula()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM musteri_onam WHERE id = NEW.onam_id AND musteri_id = NEW.musteri_id) THEN
    RAISE EXCEPTION 'onam_musteri_uyusmuyor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_2_musteri_foto_onam_dogrula ON musteri_foto;
CREATE TRIGGER trg_2_musteri_foto_onam_dogrula
  BEFORE INSERT ON musteri_foto
  FOR EACH ROW EXECUTE FUNCTION musteri_foto_onam_dogrula();

DROP TRIGGER IF EXISTS trg_musteri_foto_audit ON musteri_foto;
CREATE TRIGGER trg_musteri_foto_audit
  AFTER INSERT OR DELETE ON musteri_foto
  FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();

DROP POLICY IF EXISTS "musteri_foto_select_klinik" ON musteri_foto;
CREATE POLICY "musteri_foto_select_klinik" ON musteri_foto
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_foto_select_portal" ON musteri_foto;
CREATE POLICY "musteri_foto_select_portal" ON musteri_foto
  FOR SELECT USING (musteri_id = current_musteri_id());

DROP POLICY IF EXISTS "musteri_foto_ekle_klinik" ON musteri_foto;
CREATE POLICY "musteri_foto_ekle_klinik" ON musteri_foto
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_foto_sil_admin" ON musteri_foto;
CREATE POLICY "musteri_foto_sil_admin" ON musteri_foto
  FOR DELETE USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ============================================================
-- updated_at trigger'ları (mutable tablolar; append-only loglar hariç:
-- musteri_olcum, ev_egzersiz_kalemi'nin altındaki takip logu değil kalemi,
-- musteri_iletisim_log, randevu_on_form, musteri_onam, musteri_foto)
-- ============================================================
DO $$
DECLARE
  tablo text;
BEGIN
  FOREACH tablo IN ARRAY ARRAY[
    'islem_kontrendikasyon', 'musteri_hedef', 'olcek_tanimi', 'egzersiz_kutuphanesi',
    'ev_egzersiz_programi', 'ev_egzersiz_kalemi', 'ev_egzersiz_takip',
    'seans_checklist_sablonu', 'randevu_checklist', 'musteri_anket',
    'musteri_iliski', 'musteri_sigorta', 'musteri_belge'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', tablo, tablo);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tablo, tablo
    );
  END LOOP;
END $$;

-- ============================================================
-- H) VIEW'LAR
-- ============================================================

-- H19) v_musteri_ozet (plain view; security_invoker ile RLS her zaman
-- sorguyu yapan kullanıcının izinleriyle değerlendirilir)
CREATE OR REPLACE VIEW v_musteri_ozet WITH (security_invoker = true) AS
SELECT
  m.id AS musteri_id,
  m.klinik_id,
  vas.son_skor AS son_vas_skoru,
  vas.son_tarih AS son_vas_tarihi,
  COALESCE(hedef.aktif_hedef_sayisi, 0) AS aktif_hedef_sayisi,
  COALESCE(paket.kalan_paket_hakki, 0) AS kalan_paket_hakki,
  COALESCE(bakiye.bakiye, 0) AS bakiye,
  seans.son_seans_tarihi,
  jsonb_array_length(COALESCE(m.risk_bayraklari, '[]'::jsonb)) AS aktif_risk_bayrak_sayisi,
  COALESCE(noshow.no_show_sayisi, 0) AS no_show_sayisi
FROM musteri m
LEFT JOIN LATERAL (
  SELECT mo.hesaplanan_skor AS son_skor, mo.olcum_tarihi AS son_tarih
  FROM musteri_olcum mo
  JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id
  WHERE mo.musteri_id = m.id AND ot.kod = 'VAS'
  ORDER BY mo.olcum_tarihi DESC
  LIMIT 1
) vas ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS aktif_hedef_sayisi FROM musteri_hedef mh
  WHERE mh.musteri_id = m.id AND mh.durum = 'aktif'
) hedef ON true
LEFT JOIN LATERAL (
  SELECT sum(ps.kalan_adet) AS kalan_paket_hakki FROM paket_satis ps
  WHERE ps.musteri_id = m.id AND ps.durum = 'aktif' AND ps.gecerlilik_bitis_tarihi >= current_date
) paket ON true
LEFT JOIN LATERAL (
  -- Varsayım: 'kredi' ve 'borc' hareketleri cari bakiyeyi oluşturur; 'odeme'/'iade'
  -- ilgili ödemenin audit-trail kaydı olduğu için bakiyeyi etkilemez (bkz. dosya başı not).
  SELECT sum(CASE WHEN mb.tur = 'kredi' THEN mb.tutar WHEN mb.tur = 'borc' THEN -mb.tutar ELSE 0 END) AS bakiye
  FROM musteri_bakiye_hareket mb WHERE mb.musteri_id = m.id
) bakiye ON true
LEFT JOIN LATERAL (
  SELECT max(r.baslangic) AS son_seans_tarihi FROM randevu r
  WHERE r.musteri_id = m.id AND r.durum = 'geldi'
) seans ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS no_show_sayisi FROM randevu r
  WHERE r.musteri_id = m.id AND r.durum = 'gelmedi'
) noshow ON true;

GRANT SELECT ON v_musteri_ozet TO authenticated;

-- H20) mv_musteri_ilerleme (materialized view; RLS matview'a uygulanamadığı
-- için ham matview client rollerinden REVOKE edilir, uygulama sadece
-- aşağıdaki v_musteri_ilerleme VIEW'ını sorgulamalı).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_musteri_ilerleme AS
SELECT
  mo.id,
  mo.klinik_id,
  mo.musteri_id,
  mo.olcek_tanimi_id,
  ot.kod AS olcek_kod,
  ot.ad AS olcek_ad,
  ot.yorum_yonu,
  mo.randevu_id,
  mo.hesaplanan_skor,
  mo.olcum_tarihi
FROM musteri_olcum mo
JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_musteri_ilerleme_id ON mv_musteri_ilerleme(id);
CREATE INDEX IF NOT EXISTS idx_mv_musteri_ilerleme_musteri_id ON mv_musteri_ilerleme(musteri_id, olcum_tarihi);

REVOKE ALL ON mv_musteri_ilerleme FROM PUBLIC, anon, authenticated;

-- NOT security_invoker: authenticated'ın matview üzerinde artık hiç grant'i
-- yok, bu yüzden view'ın table-level erişimi VIEW SAHİBİNİN (postgres)
-- yetkisiyle çalışmalı (definer-tarzı, varsayılan view davranışı). Tenant
-- izolasyonu security_invoker'dan değil, WHERE'deki current_klinik_id()'den
-- geliyor — o da SECURITY DEFINER olduğu için oturumun auth.uid()'ini zaten
-- doğru okuyor (view sahibinden bağımsız).
CREATE OR REPLACE VIEW v_musteri_ilerleme AS
SELECT * FROM mv_musteri_ilerleme WHERE klinik_id = current_klinik_id() OR is_super_admin();

GRANT SELECT ON v_musteri_ilerleme TO authenticated;

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN
--   ('islem_kontrendikasyon','musteri_hedef','olcek_tanimi','musteri_olcum','egzersiz_kutuphanesi',
--    'ev_egzersiz_programi','ev_egzersiz_kalemi','ev_egzersiz_takip','seans_checklist_sablonu',
--    'randevu_checklist','musteri_iletisim_log','musteri_anket','randevu_on_form','musteri_iliski',
--    'musteri_sigorta','musteri_belge','musteri_onam','musteri_foto');
-- SELECT matviewname FROM pg_matviews WHERE matviewname = 'mv_musteri_ilerleme';
-- SELECT table_name FROM information_schema.views WHERE table_name IN ('v_musteri_ozet','v_musteri_ilerleme');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'musteri' AND column_name = 'risk_bayraklari';
