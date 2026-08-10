-- =====================================================================
-- İş Başvurusu akışı Personel bölümüne taşınıyor ve genişletiliyor
--
-- Kullanıcı kararı: "Yeni Personel Ekle" artık "İş Başvurusu Ekle" olacak,
-- tıklanınca bir başvuru listesine gidilecek (beklemede/olumlu/olumsuz),
-- olumlu olunca içindeki bilgilerle Personel oluşturma sihirbazı önceden
-- doldurulacak; olumsuz/beklemede kalan başvurular ay/yıl bazlı arşivde
-- kalmaya devam edecek (silinmiyor). İş Başvuru Formu (PDF) ile aynı alan
-- setini taşıyacak zenginleştirilmiş bir web formu da (mevcut QR linki,
-- /basvuru/is/[klinikId]) aynı tabloya yazacak.
--
-- Ayrıca kullanıcı kararı: mevcut ayrı "Personel Başvurusu" (QR,
-- personel_basvuru_taslagi) akışı bu yeni İş Başvurusu akışıyla
-- BİRLEŞTİRİLİYOR (kaldırılıyor) — iki tablo da canlıda 0 satırdı
-- (service-role ile doğrulandı, 2026-08-10), veri kaybı riski yok.
-- İdempotent, tek blok.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) is_basvurusu: İş Başvuru Formu (PDF/web) ile birebir aynı alanlar
-- ---------------------------------------------------------------------
ALTER TABLE is_basvurusu
  ADD COLUMN IF NOT EXISTS dogum_tarihi date,
  ADD COLUMN IF NOT EXISTS tc_kimlik_no text,
  ADD COLUMN IF NOT EXISTS adres text,
  ADD COLUMN IF NOT EXISTS bizi_nereden_duydunuz text,
  ADD COLUMN IF NOT EXISTS calismaya_baslama_tarihi date,
  ADD COLUMN IF NOT EXISTS calisma_sekli text CHECK (calisma_sekli IN ('tam_zamanli', 'yari_zamanli')),
  ADD COLUMN IF NOT EXISTS beklenen_ucret text,
  ADD COLUMN IF NOT EXISTS egitim_okul_bolum text,
  ADD COLUMN IF NOT EXISTS egitim_mezuniyet_yili text,
  ADD COLUMN IF NOT EXISTS egitim_sertifikalar text,
  -- [{sirket, gorev, sure}] — PDF'teki 3 satırlık İş Deneyimi ile birebir
  ADD COLUMN IF NOT EXISTS is_deneyimi jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{ad_soyad, telefon, baglanti}] — PDF'teki 2 satırlık Referanslar
  ADD COLUMN IF NOT EXISTS referanslar jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kvkk_onay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kvkk_onay_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS degerlendiren_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS degerlendirme_tarihi timestamptz,
  -- Olumlu olup Personel'e aktarılınca dolar — hangi personelin hangi
  -- başvurudan geldiğini izlemek için (aynı başvuru ikinci kez "aktarılamaz").
  ADD COLUMN IF NOT EXISTS personel_id uuid REFERENCES personel(id) ON DELETE SET NULL;

-- Eski 4 durumlu (yeni/incelendi/reddedildi/kabul_edildi) yerine 3 durumlu
-- (beklemede/olumlu/olumsuz) — canlıda 0 satır olduğu doğrulandı, yine de
-- ileride veri olursa kaybolmasın diye eşleme UPDATE'i idempotent bırakıldı.
ALTER TABLE is_basvurusu DROP CONSTRAINT IF EXISTS is_basvurusu_durum_check;

UPDATE is_basvurusu SET durum = 'beklemede' WHERE durum IN ('yeni', 'incelendi');
UPDATE is_basvurusu SET durum = 'olumlu' WHERE durum = 'kabul_edildi';
UPDATE is_basvurusu SET durum = 'olumsuz' WHERE durum = 'reddedildi';

ALTER TABLE is_basvurusu ALTER COLUMN durum SET DEFAULT 'beklemede';
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_durum_check CHECK (durum IN ('beklemede', 'olumlu', 'olumsuz'));

-- Anon (herkese açık web formu) sadece yeni bir "beklemede" başvuru
-- oluşturabilir — değerlendirme/aktarım alanlarını asla kendisi dolduramaz
-- (personel_basvuru_taslagi'deki aynı desenle tutarlı).
DROP POLICY IF EXISTS "is_basvurusu_insert_anon" ON is_basvurusu;
CREATE POLICY "is_basvurusu_insert_anon" ON is_basvurusu
  FOR INSERT TO anon
  WITH CHECK (
    durum = 'beklemede'
    AND degerlendiren_kullanici_id IS NULL
    AND degerlendirme_tarihi IS NULL
    AND personel_id IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_is_basvurusu_durum ON is_basvurusu(klinik_id, durum);

-- ---------------------------------------------------------------------
-- 2) personel_basvuru_taslagi kaldırıldı — İş Başvurusu akışıyla
--    birleştirildi (kullanıcı kararı). Canlıda 0 satır olduğu doğrulandı.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS personel_basvuru_taslagi CASCADE;

-- ---------------------------------------------------------------------
-- 3) v_personel_bilgi_durumu: Personel Listesi kutucuklarındaki
--    "Bilgiler Tamam / Bilgiler Eksik" rozeti için — tek yerde tanımlı
--    tamlık kriteri (security_invoker: altındaki tabloların RLS'i geçerli
--    kalır, bkz. v_hasta_ozet ile aynı desen).
--    Kriter (bilinçli varsayılan, dokümante edildi): doğum tarihi, adres
--    (il VEYA serbest metin adres), acil durum kişisi, TC kimlik/pasaport
--    (personel_hassas'ta bir satır — düz metin okunmuyor, sadece var/yok),
--    ve rol=terapist ise ayrıca mesleki belge (diploma no veya uzmanlık
--    belge no) kayıtlı olmalı.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_personel_bilgi_durumu WITH (security_invoker = true) AS
SELECT
  p.id AS personel_id,
  (
    p.dogum_tarihi IS NOT NULL
    AND (COALESCE(p.il, '') <> '' OR COALESCE(p.adres, '') <> '')
    AND EXISTS (SELECT 1 FROM personel_acil_kisi ak WHERE ak.personel_id = p.id)
    AND EXISTS (
      SELECT 1 FROM personel_hassas ph
      WHERE ph.personel_id = p.id AND (ph.tc_kimlik_sifreli IS NOT NULL OR ph.pasaport_no_sifreli IS NOT NULL)
    )
    AND (
      k.rol IS DISTINCT FROM 'terapist'
      OR EXISTS (
        SELECT 1 FROM personel_mesleki_belge mb
        WHERE mb.personel_id = p.id AND (mb.diploma_no IS NOT NULL OR mb.uzmanlik_belge_no IS NOT NULL)
      )
    )
  ) AS bilgiler_tamam
FROM personel p
LEFT JOIN kullanici k ON k.id = p.kullanici_id;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'is_basvurusu' ORDER BY ordinal_position;
-- SELECT to_regclass('personel_basvuru_taslagi'); -- null dönmeli
-- SELECT * FROM v_personel_bilgi_durumu LIMIT 5;
