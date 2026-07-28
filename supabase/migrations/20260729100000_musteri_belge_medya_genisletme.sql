-- musteri_belge'yi tüm görsel/dosya türlerini (radyoloji/klinik_foto/dokuman)
-- kapsayacak şekilde genişletir; önceki turda ayrı açılan musteri_foto'nun
-- verisi musteri_belge'ye taşınıp tablo düşürülür (kullanıcı kararı — tek
-- tablo, iki ayrı tablo tutulmayacak). musteri-belge Storage bucket'ı + RLS
-- policy'leri ve v_musteri_karsilastirma view'ı eklenir. İdempotent, tek blok.
--
-- Not (kapsam kararı, kullanıcı onayıyla): Postgres'te SELECT trigger diye bir
-- şey YOK (trigger event'leri sadece INSERT/UPDATE/DELETE/TRUNCATE'i
-- destekler — bu DB'nin donanımsal kısıtı, tasarım tercihi değil). "Kim hangi
-- belgeyi görüntüledi" logu bu yüzden otomatik trigger ile yazılamıyor.
-- Bunun yerine musteri_belge_goruntule(id) SECURITY DEFINER RPC fonksiyonu
-- eklendi: uygulama bir belgeyi GERÇEKTEN açarken (signed URL istemeden hemen
-- önce) bunu çağırır, audit_log'a 'select' satırı yazılır ve belge satırı
-- döner. Liste/galeri ekranındaki ham SELECT'ler (RLS'in zaten kapıladığı)
-- audit'lenmez — sadece somut açma anı. Gerçek Signed URL üretimi + 5 dk
-- expiry, Supabase Storage JS SDK üzerinden uygulama katmanında yapılır
-- (`storage.createSignedUrl(path, 300)`); bu migration sadece kimin bu
-- isteği yapabileceğini storage.objects RLS'iyle kapılıyor.

-- ============================================================
-- 1) musteri_belge: yeni kolonlar
-- ============================================================

-- kategori (mevcut belge_turu değerlerinden geriye dönük türetilir)
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS kategori text;
UPDATE musteri_belge SET kategori = CASE
  WHEN belge_turu IN ('rontgen', 'mr') THEN 'radyoloji'
  ELSE 'dokuman'
END WHERE kategori IS NULL;
ALTER TABLE musteri_belge ALTER COLUMN kategori SET NOT NULL;
ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_kategori_check;
ALTER TABLE musteri_belge ADD CONSTRAINT musteri_belge_kategori_check
  CHECK (kategori IN ('radyoloji', 'klinik_foto', 'dokuman'));

-- belge_turu: eski düz CHECK'i kaldırıp kategoriye bağlı kombine CHECK ekle
ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_belge_turu_check;
ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_kategori_turu_check;
ALTER TABLE musteri_belge ADD CONSTRAINT musteri_belge_kategori_turu_check CHECK (
  (kategori = 'radyoloji' AND belge_turu IN ('rontgen', 'mr', 'tomografi', 'ultrason'))
  OR (kategori = 'klinik_foto' AND belge_turu IN ('postur_on', 'postur_yan', 'postur_arka', 'bolgesel'))
  OR (kategori = 'dokuman' AND belge_turu IN ('recete', 'sevk', 'epikriz', 'diger'))
);

-- bolge (2D vücut haritasıyla aynı bölge kodları — app katmanında ortak sabit liste kullanılmalı)
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS bolge text;

-- cekim_tarihi (upload_tarihi'nden ayrı; sıralama buna göre yapılacak)
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS cekim_tarihi date;
UPDATE musteri_belge SET cekim_tarihi = upload_tarihi::date WHERE cekim_tarihi IS NULL;
ALTER TABLE musteri_belge ALTER COLUMN cekim_tarihi SET DEFAULT current_date;
ALTER TABLE musteri_belge ALTER COLUMN cekim_tarihi SET NOT NULL;

-- karsilastirma_grubu_id (önce/sonra/ara-kontrol serisini gruplayan serbest id)
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS karsilastirma_grubu_id uuid;

-- asama
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS asama text;
ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_asama_check;
ALTER TABLE musteri_belge ADD CONSTRAINT musteri_belge_asama_check
  CHECK (asama IS NULL OR asama IN ('tedavi_oncesi', 'ara_kontrol', 'tedavi_sonrasi'));

-- onam_id (nullable; klinik_foto için aşağıdaki CHECK ile zorunlu kılınır)
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS onam_id uuid REFERENCES musteri_onam(id) ON DELETE RESTRICT;

ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_klinik_foto_onam_check;
ALTER TABLE musteri_belge ADD CONSTRAINT musteri_belge_klinik_foto_onam_check
  CHECK (kategori <> 'klinik_foto' OR onam_id IS NOT NULL);

-- onam_id verilmişse aynı musteri_id'ye ait olmalı (musteri_foto'da da vardı, aynı desen)
CREATE OR REPLACE FUNCTION musteri_belge_onam_dogrula()
RETURNS trigger AS $$
BEGIN
  IF NEW.onam_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM musteri_onam WHERE id = NEW.onam_id AND musteri_id = NEW.musteri_id
  ) THEN
    RAISE EXCEPTION 'onam_musteri_uyusmuyor';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_musteri_belge_onam_dogrula ON musteri_belge;
CREATE TRIGGER trg_musteri_belge_onam_dogrula
  BEFORE INSERT OR UPDATE ON musteri_belge
  FOR EACH ROW EXECUTE FUNCTION musteri_belge_onam_dogrula();

-- Medya meta verisi
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS thumbnail_path text;
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS dosya_mime text;
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS dosya_boyut_byte bigint;
ALTER TABLE musteri_belge DROP CONSTRAINT IF EXISTS musteri_belge_dosya_boyut_check;
ALTER TABLE musteri_belge ADD CONSTRAINT musteri_belge_dosya_boyut_check
  CHECK (dosya_boyut_byte IS NULL OR dosya_boyut_byte >= 0);
ALTER TABLE musteri_belge ADD COLUMN IF NOT EXISTS exif_temizlendi boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2) musteri_foto verisini musteri_belge'ye taşı, sonra tabloyu düşür
-- ============================================================

-- Aynı (musteri_id, bolge) grubunda birden fazla eski foto varsa sadece en
-- yenisi is_guncel=true olur (aşağıda yeniden kurulacak partial unique index
-- ihlal edilmesin diye).
INSERT INTO musteri_belge (
  id, klinik_id, musteri_id, kategori, belge_turu, bolge, storage_path,
  upload_tarihi, cekim_tarihi, yukleyen_kullanici_id, onam_id, metadata,
  is_encrypted, versiyon_no, is_guncel, created_at
)
SELECT
  mf.id, mf.klinik_id, mf.musteri_id, 'klinik_foto', 'bolgesel', mf.bolge, mf.storage_path,
  mf.cekim_tarihi, mf.cekim_tarihi::date, mf.ceken_kullanici_id, mf.onam_id,
  jsonb_build_object('etiketler', mf.etiketler, 'tasindi_kaynak', 'musteri_foto'),
  false, 1,
  (row_number() OVER (PARTITION BY mf.musteri_id, mf.bolge ORDER BY mf.cekim_tarihi DESC, mf.id DESC) = 1),
  mf.created_at
FROM musteri_foto mf
WHERE NOT EXISTS (SELECT 1 FROM musteri_belge mb WHERE mb.id = mf.id);

DROP TABLE IF EXISTS musteri_foto CASCADE;
DROP FUNCTION IF EXISTS musteri_foto_onam_dogrula();

-- ============================================================
-- 3) İndeksler (veri taşındıktan sonra kurulur ki eski çakışan kayıt olmasın)
-- ============================================================
DROP INDEX IF EXISTS idx_musteri_belge_guncel;
CREATE UNIQUE INDEX IF NOT EXISTS idx_musteri_belge_guncel
  ON musteri_belge(musteri_id, belge_turu, bolge) WHERE is_guncel = true;

CREATE INDEX IF NOT EXISTS idx_musteri_belge_kategori ON musteri_belge(kategori);
CREATE INDEX IF NOT EXISTS idx_musteri_belge_karsilastirma_grubu
  ON musteri_belge(karsilastirma_grubu_id) WHERE karsilastirma_grubu_id IS NOT NULL;

-- ============================================================
-- 4) "Görüntüleme" audit RPC'si (bkz. dosya başı not — SELECT trigger yok)
-- ============================================================
CREATE OR REPLACE FUNCTION musteri_belge_goruntule(p_id uuid)
RETURNS musteri_belge AS $$
DECLARE
  v_row musteri_belge%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM musteri_belge WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'belge_bulunamadi';
  END IF;

  IF NOT (
    v_row.klinik_id = current_klinik_id()
    OR v_row.musteri_id = current_musteri_id()
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (
    v_row.klinik_id, auth.uid(), 'select', 'musteri_belge', v_row.id,
    jsonb_build_object('portal_musteri_mi', v_row.musteri_id = current_musteri_id())
  );

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION musteri_belge_goruntule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION musteri_belge_goruntule(uuid) TO authenticated;

-- ============================================================
-- 5) Storage: musteri-belge bucket'ı (private) + RLS
-- Path deseni: {klinik_id}/{musteri_id}/{kategori}/{belge_id}.{ext}
-- Erişim yalnızca Signed URL (expiry uygulama katmanında 300 sn geçilerek
-- ayarlanır); bucket dashboard'dan public yapılmamalı.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('musteri-belge', 'musteri-belge', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "musteri_belge_storage_select" ON storage.objects;
CREATE POLICY "musteri_belge_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'musteri-belge'
    AND (
      ((storage.foldername(name))[1])::uuid = current_klinik_id()
      OR ((storage.foldername(name))[2])::uuid = current_musteri_id()
      OR is_super_admin()
    )
  );

DROP POLICY IF EXISTS "musteri_belge_storage_insert" ON storage.objects;
CREATE POLICY "musteri_belge_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'musteri-belge'
    AND ((storage.foldername(name))[1])::uuid = current_klinik_id()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
  );

DROP POLICY IF EXISTS "musteri_belge_storage_update" ON storage.objects;
CREATE POLICY "musteri_belge_storage_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'musteri-belge'
    AND ((storage.foldername(name))[1])::uuid = current_klinik_id()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
  )
  WITH CHECK (
    bucket_id = 'musteri-belge'
    AND ((storage.foldername(name))[1])::uuid = current_klinik_id()
    AND current_rol() IN ('klinik_admin', 'resepsiyon', 'terapist')
  );

DROP POLICY IF EXISTS "musteri_belge_storage_delete" ON storage.objects;
CREATE POLICY "musteri_belge_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'musteri-belge'
    AND ((storage.foldername(name))[1])::uuid = current_klinik_id()
    AND current_rol() = 'klinik_admin'
  );

-- ============================================================
-- 6) v_musteri_karsilastirma
-- Kesin ikili değil — karsilastirma_grubu_id bazlı satır listesi döner
-- (asama 3 değer alabildiği için öncesi/ara-kontrol/sonrası serisi olabilir);
-- eşleştirme/sıralama uygulama katmanında yapılır.
-- ============================================================
CREATE OR REPLACE VIEW v_musteri_karsilastirma WITH (security_invoker = true) AS
SELECT
  mb.karsilastirma_grubu_id,
  mb.id AS belge_id,
  mb.musteri_id,
  mb.klinik_id,
  mb.bolge,
  mb.asama,
  mb.cekim_tarihi,
  mb.storage_path,
  mb.thumbnail_path
FROM musteri_belge mb
WHERE mb.karsilastirma_grubu_id IS NOT NULL
ORDER BY mb.karsilastirma_grubu_id, mb.cekim_tarihi;

GRANT SELECT ON v_musteri_karsilastirma TO authenticated;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'musteri_belge'
--   AND column_name IN ('kategori','bolge','cekim_tarihi','karsilastirma_grubu_id','asama',
--   'onam_id','thumbnail_path','dosya_mime','dosya_boyut_byte','exif_temizlendi');
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'musteri_foto'; -- boş dönmeli
-- SELECT id FROM storage.buckets WHERE id = 'musteri-belge';
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'musteri_belge%';
-- SELECT proname FROM pg_proc WHERE proname = 'musteri_belge_goruntule';
-- SELECT table_name FROM information_schema.views WHERE table_name = 'v_musteri_karsilastirma';
