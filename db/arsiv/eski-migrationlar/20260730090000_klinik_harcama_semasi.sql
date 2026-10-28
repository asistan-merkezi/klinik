-- Muhasebe > Raporlar için elle giriş yapılan işletme/vergi-SGK gideri tablosu.
-- Kullanıcı kararı (bkz. görev bağlamı): SGK maliyeti personel tablosuna değil,
-- burada 'vergi_sgk' kategorisiyle takip edilecek (personel şeması genişletilmedi).
-- Gerçek Paraşüt gider-faturası senkronizasyonu henüz yok (hesap/API kimlik
-- bilgisi yok — bkz. CLAUDE.md "Yol Haritası"); is_faturali=true satırlar bu
-- turda "Faturalı Giderler" bucket'ını temsil ediyor, parasut_fatura_id yerine
-- serbest metin fatura_no tutuluyor (TODO: gerçek entegrasyon gelince
-- klinik_muhasebe_entegrasyonu/fatura desenine benzer bir gider-fatura kuyruğuna
-- taşınabilir). İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS klinik_harcama (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  kategori text NOT NULL CHECK (kategori IN ('kira', 'fatura', 'malzeme', 'vergi_sgk', 'diger')),
  tutar numeric(12, 2) NOT NULL CHECK (tutar >= 0),
  tarih date NOT NULL,
  aciklama text,
  is_faturali boolean NOT NULL DEFAULT false,
  -- TODO: gerçek Paraşüt gider senkronizasyonu kurulunca (klinik_muhasebe_entegrasyonu
  -- bağlantısı üzerinden) bu alan yerine ilişkisel bir gider-fatura tablosuna geçilebilir.
  fatura_no text,
  olusturan_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_harcama ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_klinik_harcama_klinik_id ON klinik_harcama(klinik_id);
CREATE INDEX IF NOT EXISTS idx_klinik_harcama_tarih ON klinik_harcama(tarih);
CREATE INDEX IF NOT EXISTS idx_klinik_harcama_kategori ON klinik_harcama(kategori);

DROP TRIGGER IF EXISTS trg_klinik_harcama_updated_at ON klinik_harcama;
CREATE TRIGGER trg_klinik_harcama_updated_at BEFORE UPDATE ON klinik_harcama
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: görüntüleme klinik_admin + muhasebe (finans raporlama işi); yönetim
-- (ekleme/düzenleme/silme) sadece klinik_admin. resepsiyon/terapist hiç erişemez
-- (finansal veri, Raporlar erişim kararıyla tutarlı).
DROP POLICY IF EXISTS "klinik_harcama_select" ON klinik_harcama;
CREATE POLICY "klinik_harcama_select" ON klinik_harcama
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "klinik_harcama_yonet_admin" ON klinik_harcama;
CREATE POLICY "klinik_harcama_yonet_admin" ON klinik_harcama
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'klinik_harcama';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'klinik_harcama';
