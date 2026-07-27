-- "Muhasebe Sync" ayarları: klinik başına Paraşüt API kimlik bilgileri.
-- Ayrı tabloda tutulur (musteri_hassas deseniyle tutarlı) ki client_secret
-- hiçbir zaman genel bir "select *" ile yanlışlıkla ekrana taşınmasın —
-- uygulama kodu bu kolonu asla SELECT etmez, sadece INSERT/UPDATE eder.
-- Güvenlik modeli projenin geri kalanıyla tutarlı: pgcrypto şifreleme yok,
-- izolasyon RLS + Supabase disk-seviyesi şifrelemeyle sağlanıyor.
CREATE TABLE IF NOT EXISTS klinik_muhasebe_entegrasyonu (
  klinik_id uuid PRIMARY KEY REFERENCES klinik(id) ON DELETE CASCADE,
  parasut_client_id text,
  parasut_client_secret text,
  parasut_company_id text,
  baglanti_durumu text NOT NULL DEFAULT 'bekliyor' CHECK (baglanti_durumu IN ('bekliyor', 'baglandi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE klinik_muhasebe_entegrasyonu ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_klinik_muhasebe_entegrasyonu_updated_at ON klinik_muhasebe_entegrasyonu;
CREATE TRIGGER trg_klinik_muhasebe_entegrasyonu_updated_at BEFORE UPDATE ON klinik_muhasebe_entegrasyonu
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Görüntüleme: klinik_admin + muhasebe (bağlantı durumunu görebilir, secret'ı
-- uygulama kodu zaten hiç seçmiyor). Yönetim (ekle/güncelle/sil): klinik_admin.
DROP POLICY IF EXISTS "klinik_muhasebe_entegrasyonu_select" ON klinik_muhasebe_entegrasyonu;
CREATE POLICY "klinik_muhasebe_entegrasyonu_select" ON klinik_muhasebe_entegrasyonu
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "klinik_muhasebe_entegrasyonu_yonet_admin" ON klinik_muhasebe_entegrasyonu;
CREATE POLICY "klinik_muhasebe_entegrasyonu_yonet_admin" ON klinik_muhasebe_entegrasyonu
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());
