-- Sprint 2 (ödeme + paket) temel şeması: işlem tanımı/kategori, paket, ödeme
-- (kalem + yöntem satırları) ve müşteri bakiye hareketi (ledger).
-- Paraşüt (fatura tablosu) ve WhatsApp entegrasyonu ayrı bir migration'da ele alınacak.
-- Bu turda randevu tablosuna paket_satis_id eklenmedi (paket kullanım/düşüm akışı
-- ayrı bir adım); mevcut randevu şeması değişmedi.

-- 1) islem_kategori
CREATE TABLE IF NOT EXISTS islem_kategori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (klinik_id, ad)
);
ALTER TABLE islem_kategori ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_kategori_klinik_id ON islem_kategori(klinik_id);

-- 2) islem_tanimi
CREATE TABLE IF NOT EXISTS islem_tanimi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  islem_kategori_id uuid NOT NULL REFERENCES islem_kategori(id) ON DELETE RESTRICT,
  gerekli_cihaz_id uuid REFERENCES cihaz(id) ON DELETE SET NULL,
  ad text NOT NULL,
  fiyat numeric(10, 2) NOT NULL CHECK (fiyat >= 0),
  kdv_orani numeric(5, 2) NOT NULL DEFAULT 20 CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  parasut_hizmet_kodu text,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE islem_tanimi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_klinik_id ON islem_tanimi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_islem_tanimi_kategori_id ON islem_tanimi(islem_kategori_id);

-- 3) paket (tanım: örn. "10 Seans Manuel Terapi")
CREATE TABLE IF NOT EXISTS paket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  islem_tanimi_id uuid NOT NULL REFERENCES islem_tanimi(id) ON DELETE RESTRICT,
  ad text NOT NULL,
  seans_sayisi integer NOT NULL CHECK (seans_sayisi > 0),
  gecerlilik_gun integer NOT NULL CHECK (gecerlilik_gun > 0),
  fiyat numeric(10, 2) NOT NULL CHECK (fiyat >= 0),
  kdv_orani numeric(5, 2) NOT NULL DEFAULT 20 CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE paket ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_paket_klinik_id ON paket(klinik_id);

-- 4) odeme (tahsilat başlığı)
CREATE TABLE IF NOT EXISTS odeme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE RESTRICT,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  iskonto_tutari numeric(10, 2) NOT NULL DEFAULT 0 CHECK (iskonto_tutari >= 0),
  faturali boolean NOT NULL DEFAULT false,
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE odeme ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_odeme_klinik_id ON odeme(klinik_id);
CREATE INDEX IF NOT EXISTS idx_odeme_musteri_id ON odeme(musteri_id);

-- 5) paket_satis (müşteriye satılan somut paket + kalan hak)
-- odeme ile ilişki nullable: paket bazen ödeme akışından önce/ayrı da tanımlanabilir.
CREATE TABLE IF NOT EXISTS paket_satis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  paket_id uuid NOT NULL REFERENCES paket(id) ON DELETE RESTRICT,
  odeme_id uuid REFERENCES odeme(id) ON DELETE SET NULL,
  kalan_adet integer NOT NULL CHECK (kalan_adet >= 0),
  satis_tarihi date NOT NULL DEFAULT current_date,
  gecerlilik_bitis_tarihi date NOT NULL,
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'dondu', 'bitti', 'iptal')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE paket_satis ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_paket_satis_klinik_id ON paket_satis(klinik_id);
CREATE INDEX IF NOT EXISTS idx_paket_satis_musteri_id ON paket_satis(musteri_id);

-- 6) odeme_kalemi (ne satıldı — işlem veya paket, fiyat/KDV o anki değerden snapshot)
-- islem_tanimi_id / paket_satis_id ikisi birden dolu olamaz; ikisi de boşsa serbest/özel kalemdir.
CREATE TABLE IF NOT EXISTS odeme_kalemi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  odeme_id uuid NOT NULL REFERENCES odeme(id) ON DELETE CASCADE,
  islem_tanimi_id uuid REFERENCES islem_tanimi(id) ON DELETE SET NULL,
  paket_satis_id uuid REFERENCES paket_satis(id) ON DELETE SET NULL,
  aciklama text,
  miktar integer NOT NULL DEFAULT 1 CHECK (miktar > 0),
  birim_fiyat numeric(10, 2) NOT NULL CHECK (birim_fiyat >= 0),
  kdv_orani numeric(5, 2) NOT NULL CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (islem_tanimi_id IS NULL OR paket_satis_id IS NULL)
);
ALTER TABLE odeme_kalemi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_odeme_kalemi_odeme_id ON odeme_kalemi(odeme_id);

-- 7) odeme_satiri (nasıl ödendi — parçalı ödeme için yöntem/tutar kırılımı)
CREATE TABLE IF NOT EXISTS odeme_satiri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  odeme_id uuid NOT NULL REFERENCES odeme(id) ON DELETE CASCADE,
  yontem text NOT NULL CHECK (yontem IN ('kredi_karti', 'banka_havalesi', 'nakit')),
  tutar numeric(10, 2) NOT NULL CHECK (tutar > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE odeme_satiri ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_odeme_satiri_odeme_id ON odeme_satiri(odeme_id);

-- 8) musteri_bakiye_hareket (ledger; müşteri bakiyesi bu tablodan türetilir)
CREATE TABLE IF NOT EXISTS musteri_bakiye_hareket (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  musteri_id uuid NOT NULL REFERENCES musteri(id) ON DELETE CASCADE,
  tur text NOT NULL CHECK (tur IN ('odeme', 'iade', 'kredi', 'borc')),
  tutar numeric(10, 2) NOT NULL,
  odeme_id uuid REFERENCES odeme(id) ON DELETE SET NULL,
  aciklama text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE musteri_bakiye_hareket ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_musteri_bakiye_hareket_klinik_id ON musteri_bakiye_hareket(klinik_id);
CREATE INDEX IF NOT EXISTS idx_musteri_bakiye_hareket_musteri_id ON musteri_bakiye_hareket(musteri_id);

-- 9) updated_at trigger'ları (musteri_bakiye_hareket/odeme_kalemi/odeme_satiri append-only, trigger gerekmiyor)
DO $$
DECLARE
  tablo text;
BEGIN
  FOREACH tablo IN ARRAY ARRAY['islem_kategori', 'islem_tanimi', 'paket', 'paket_satis', 'odeme']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', tablo, tablo);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tablo, tablo
    );
  END LOOP;
END $$;

-- 10) RLS policy'leri
-- islem_kategori / islem_tanimi / paket: fiyat kataloğu, sadece klinik_admin yönetir; herkes görür.
DROP POLICY IF EXISTS "islem_kategori_select_klinik" ON islem_kategori;
CREATE POLICY "islem_kategori_select_klinik" ON islem_kategori
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "islem_kategori_yonet_admin" ON islem_kategori;
CREATE POLICY "islem_kategori_yonet_admin" ON islem_kategori
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "islem_tanimi_select_klinik" ON islem_tanimi;
CREATE POLICY "islem_tanimi_select_klinik" ON islem_tanimi
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "islem_tanimi_yonet_admin" ON islem_tanimi;
CREATE POLICY "islem_tanimi_yonet_admin" ON islem_tanimi
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

DROP POLICY IF EXISTS "paket_select_klinik" ON paket;
CREATE POLICY "paket_select_klinik" ON paket
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "paket_yonet_admin" ON paket;
CREATE POLICY "paket_yonet_admin" ON paket
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- odeme / paket_satis / musteri_bakiye_hareket: günlük tahsilat işi, klinik_admin + resepsiyon yönetir.
DROP POLICY IF EXISTS "odeme_select_klinik" ON odeme;
CREATE POLICY "odeme_select_klinik" ON odeme
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "odeme_yonet_resepsiyon_admin" ON odeme;
CREATE POLICY "odeme_yonet_resepsiyon_admin" ON odeme
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "paket_satis_select_klinik" ON paket_satis;
CREATE POLICY "paket_satis_select_klinik" ON paket_satis
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "paket_satis_yonet_resepsiyon_admin" ON paket_satis;
CREATE POLICY "paket_satis_yonet_resepsiyon_admin" ON paket_satis
  FOR ALL USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "musteri_bakiye_hareket_select_klinik" ON musteri_bakiye_hareket;
CREATE POLICY "musteri_bakiye_hareket_select_klinik" ON musteri_bakiye_hareket
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "musteri_bakiye_hareket_ekle_resepsiyon_admin" ON musteri_bakiye_hareket;
CREATE POLICY "musteri_bakiye_hareket_ekle_resepsiyon_admin" ON musteri_bakiye_hareket
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- odeme_kalemi / odeme_satiri: kendi odeme_id'sinin klinik'ine göre yetki (join üzerinden EXISTS).
DROP POLICY IF EXISTS "odeme_kalemi_select_klinik" ON odeme_kalemi;
CREATE POLICY "odeme_kalemi_select_klinik" ON odeme_kalemi
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM odeme o WHERE o.id = odeme_kalemi.odeme_id AND o.klinik_id = current_klinik_id()
    ) OR is_super_admin()
  );

DROP POLICY IF EXISTS "odeme_kalemi_ekle_resepsiyon_admin" ON odeme_kalemi;
CREATE POLICY "odeme_kalemi_ekle_resepsiyon_admin" ON odeme_kalemi
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM odeme o
      WHERE o.id = odeme_kalemi.odeme_id
        AND o.klinik_id = current_klinik_id()
        AND current_rol() IN ('klinik_admin', 'resepsiyon')
    ) OR is_super_admin()
  );

DROP POLICY IF EXISTS "odeme_satiri_select_klinik" ON odeme_satiri;
CREATE POLICY "odeme_satiri_select_klinik" ON odeme_satiri
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM odeme o WHERE o.id = odeme_satiri.odeme_id AND o.klinik_id = current_klinik_id()
    ) OR is_super_admin()
  );

DROP POLICY IF EXISTS "odeme_satiri_ekle_resepsiyon_admin" ON odeme_satiri;
CREATE POLICY "odeme_satiri_ekle_resepsiyon_admin" ON odeme_satiri
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM odeme o
      WHERE o.id = odeme_satiri.odeme_id
        AND o.klinik_id = current_klinik_id()
        AND current_rol() IN ('klinik_admin', 'resepsiyon')
    ) OR is_super_admin()
  );

-- Kontrol:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN
--   ('islem_kategori','islem_tanimi','paket','paket_satis','odeme','odeme_kalemi','odeme_satiri','musteri_bakiye_hareket');
