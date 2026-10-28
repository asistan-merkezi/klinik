-- Maaş Ayarları'nda maaş girilirken artık bir "geçerlilik tarihi" de alınıyor
-- (kullanıcı kararı: "hangi tarihte hangi maaşı alıyor kayıt olsun") — personel.maas
-- hâlâ "güncel maaş" tek kaynağı olarak kalıyor (maasHesapla vb. her yerde ona
-- bakıyor), bu tablo sadece geçmişe dönük kayıt/audit amaçlı; personel_ekstra_hakedis
-- ile aynı RLS deseni (görüntüleme admin+kendisi, yönetim sadece klinik_admin).
CREATE TABLE IF NOT EXISTS personel_maas_gecmisi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES personel(id) ON DELETE CASCADE,
  maas numeric(10, 2) NOT NULL CHECK (maas >= 0),
  gecerlilik_tarihi date NOT NULL DEFAULT current_date,
  ekleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE personel_maas_gecmisi ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_personel_maas_gecmisi_klinik_id ON personel_maas_gecmisi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_personel_maas_gecmisi_personel_id ON personel_maas_gecmisi(personel_id);
CREATE INDEX IF NOT EXISTS idx_personel_maas_gecmisi_gecerlilik_tarihi ON personel_maas_gecmisi(gecerlilik_tarihi);

DROP POLICY IF EXISTS "personel_maas_gecmisi_select" ON personel_maas_gecmisi;
CREATE POLICY "personel_maas_gecmisi_select" ON personel_maas_gecmisi
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin')
    OR EXISTS (
      SELECT 1 FROM personel p WHERE p.id = personel_maas_gecmisi.personel_id AND p.kullanici_id = auth.uid()
    )
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_maas_gecmisi_yonet_admin" ON personel_maas_gecmisi;
CREATE POLICY "personel_maas_gecmisi_yonet_admin" ON personel_maas_gecmisi
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'personel_maas_gecmisi';
