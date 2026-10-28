-- QR Kod ile genel kayıt akışları (kullanıcı isteği, Ayarlar > QR Kodları):
-- klinik dışına asılabilecek 4 kare kod, her biri okutulunca girişsiz (anonim)
-- bir self-servis formu açar:
--   1) Hasta Ön Kayıt  -> hasta+hasta_hassas'a doğrudan yazar (mevcut "hızlı
--      kayıt" akışıyla aynı alan seti, sadece resepsiyon yerine hastanın
--      kendisi dolduruyor).
--   2) Personel Başvurusu -> YENİ personel_basvuru_taslagi tablosuna yazar,
--      DOĞRUDAN personel/kullanıcı oluşturmaz (kullanıcı kararı: "onay bekleyen
--      taslak" — klinik_admin onaylayana kadar hiçbir hesap/login açılmaz).
--   3) İş Başvurusu -> YENİ basit is_basvurusu tablosu (kullanıcı kararı:
--      "basit form, detaylı içeriğini sonra oluştururuz" — CV yükleme/pipeline
--      bu turda kapsam dışı).
--   4) Anket ve Öneriler -> YENİ anket_yaniti tablosu, isim/telefon opsiyonel
--      (kullanıcı kararı).
--
-- Bu 4 akışın hepsi anonim (auth.uid() NULL) çağrılabildiği için mevcut
-- current_klinik_id()/current_rol()/current_hasta_id() tabanlı RLS policy'leri
-- hiçbirine uymaz (hepsi oturum gerektirir) — bu yüzden anon role'üne özel
-- YENİ/ek policy'ler eklendi (mevcut authenticated policy'lerin yerine değil,
-- yanına — OR ile birleşiyor, birbirini bozmaz).
--
-- Bilinen/kabul edilen kısıt (dokümante edildi, bu turda çözülmedi): bu uçlarda
-- rate limiting yok (CLAUDE.md'nin "Önemli endpoint'lerde rate limiting olacak"
-- notu bu 4 public route için henüz uygulanmadı) — QR linki ele geçiren biri
-- teorik olarak toplu sahte kayıt gönderebilir. hasta_hassas tarafında blast
-- radius'u daraltmak için aşağıda hasta.kayit_kanali ayrımı eklendi (bkz. not).
-- İdempotent, tek blok.

-- ==================== 1) Hasta Ön Kayıt (QR) ====================

-- Anon'un hasta_hassas'a keyfi mevcut bir hasta_id'ye veri iliştirmesini
-- engellemek için: hangi hasta satırlarının QR self-servisiyle oluştuğunu
-- ayrı bir kolonla işaretliyoruz, hasta_hassas anon policy'si SADECE bu
-- işaretli satırlara referans veren insert'lere izin veriyor (aşağıda).
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS kayit_kanali text NOT NULL DEFAULT 'resepsiyon'
  CHECK (kayit_kanali IN ('resepsiyon', 'qr_self_servis'));

DROP POLICY IF EXISTS "hasta_insert_qr_kayit" ON hasta;
CREATE POLICY "hasta_insert_qr_kayit" ON hasta
  FOR INSERT TO anon
  WITH CHECK (
    kayit_kanali = 'qr_self_servis'
    AND kvkk_onay_tarihi IS NOT NULL
    AND kvkk_onaylayan_tip = 'hasta'
  );

DROP POLICY IF EXISTS "hasta_hassas_insert_qr_kayit" ON hasta_hassas;
CREATE POLICY "hasta_hassas_insert_qr_kayit" ON hasta_hassas
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hasta h WHERE h.id = hasta_hassas.hasta_id AND h.kayit_kanali = 'qr_self_servis'
    )
  );

-- Public form sayfalarının klinik adını göstermesi için minimal, salt-okunur
-- bir RPC (portal_giris_epostasi ile aynı desen: STABLE SECURITY DEFINER,
-- anon'a GRANT edilmiş, tablodan sadece tek bir zararsız kolon döndürüyor).
CREATE OR REPLACE FUNCTION klinik_qr_bilgisi_getir(p_klinik_id uuid)
RETURNS TABLE(ad text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ad FROM klinik WHERE id = p_klinik_id;
$$;

GRANT EXECUTE ON FUNCTION klinik_qr_bilgisi_getir(uuid) TO anon, authenticated;

-- ==================== 2) Personel Başvurusu (onay bekleyen taslak) ====================

CREATE TABLE IF NOT EXISTS personel_basvuru_taslagi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL,
  telefon text NOT NULL,
  eposta text,
  basvurulan_gorev text,
  dogum_tarihi date,
  mesaj text,
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi')),
  degerlendiren_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  degerlendirme_tarihi timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personel_basvuru_taslagi_klinik_id ON personel_basvuru_taslagi(klinik_id);

DROP TRIGGER IF EXISTS trg_personel_basvuru_taslagi_updated_at ON personel_basvuru_taslagi;
CREATE TRIGGER trg_personel_basvuru_taslagi_updated_at
  BEFORE UPDATE ON personel_basvuru_taslagi
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE personel_basvuru_taslagi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personel_basvuru_taslagi_select_admin" ON personel_basvuru_taslagi;
CREATE POLICY "personel_basvuru_taslagi_select_admin" ON personel_basvuru_taslagi
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_basvuru_taslagi_update_admin" ON personel_basvuru_taslagi;
CREATE POLICY "personel_basvuru_taslagi_update_admin" ON personel_basvuru_taslagi
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "personel_basvuru_taslagi_insert_anon" ON personel_basvuru_taslagi;
CREATE POLICY "personel_basvuru_taslagi_insert_anon" ON personel_basvuru_taslagi
  FOR INSERT TO anon
  WITH CHECK (durum = 'bekliyor' AND degerlendiren_kullanici_id IS NULL AND degerlendirme_tarihi IS NULL);

-- ==================== 3) İş Başvurusu (basit form) ====================

CREATE TABLE IF NOT EXISTS is_basvurusu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  ad_soyad text NOT NULL,
  telefon text NOT NULL,
  eposta text,
  pozisyon text,
  mesaj text,
  durum text NOT NULL DEFAULT 'yeni' CHECK (durum IN ('yeni', 'incelendi', 'reddedildi', 'kabul_edildi')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_is_basvurusu_klinik_id ON is_basvurusu(klinik_id);

DROP TRIGGER IF EXISTS trg_is_basvurusu_updated_at ON is_basvurusu;
CREATE TRIGGER trg_is_basvurusu_updated_at
  BEFORE UPDATE ON is_basvurusu
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE is_basvurusu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "is_basvurusu_select_admin" ON is_basvurusu;
CREATE POLICY "is_basvurusu_select_admin" ON is_basvurusu
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "is_basvurusu_update_admin" ON is_basvurusu;
CREATE POLICY "is_basvurusu_update_admin" ON is_basvurusu
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "is_basvurusu_insert_anon" ON is_basvurusu;
CREATE POLICY "is_basvurusu_insert_anon" ON is_basvurusu
  FOR INSERT TO anon
  WITH CHECK (durum = 'yeni');

-- ==================== 4) Anket ve Öneriler (isim/telefon opsiyonel) ====================

CREATE TABLE IF NOT EXISTS anket_yaniti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  puan smallint CHECK (puan BETWEEN 1 AND 5),
  oneri_metni text,
  ad_soyad text,
  telefon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anket_yaniti_bos_olamaz CHECK (puan IS NOT NULL OR oneri_metni IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_anket_yaniti_klinik_id ON anket_yaniti(klinik_id);

ALTER TABLE anket_yaniti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anket_yaniti_select_admin" ON anket_yaniti;
CREATE POLICY "anket_yaniti_select_admin" ON anket_yaniti
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()
  );

DROP POLICY IF EXISTS "anket_yaniti_insert_anon" ON anket_yaniti;
CREATE POLICY "anket_yaniti_insert_anon" ON anket_yaniti
  FOR INSERT TO anon
  WITH CHECK (true);

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta' AND column_name = 'kayit_kanali';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename IN ('hasta','hasta_hassas','personel_basvuru_taslagi','is_basvurusu','anket_yaniti') ORDER BY tablename, cmd;
-- SELECT proname FROM pg_proc WHERE proname = 'klinik_qr_bilgisi_getir';
