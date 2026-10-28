-- Kasa/Banka özelliği: manuel "Kasaya/Bankaya Giren", "Kasadan/Bankadan Çıkan"
-- ve "Hesaplar Arası Transfer" kayıtları için tek tablo. Kasa'nın kendisi bir
-- tablo değil (klinik_ayarlar.ayarlar.kasa.baslangic_tutari tek başlangıç
-- değeri) — buradaki satırlar sadece hasta ödemesi/genel gider/personel
-- ödemesi DIŞINDA kalan, doğrudan Kasa/Banka ekranından girilen elle
-- hareketleri temsil eder. İdempotent, tek blok.

CREATE TABLE IF NOT EXISTS nakit_banka_hareketi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  tip text NOT NULL CHECK (tip IN ('giden', 'gelen', 'hesaplar_arasi')),
  kaynak_kasa boolean NOT NULL DEFAULT false,
  kaynak_banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE RESTRICT,
  hedef_kasa boolean NOT NULL DEFAULT false,
  hedef_banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE RESTRICT,
  -- Sadece tip='gelen' VE hedef banka iken anlamlı: bankaya nakit yatırma mı
  -- havale mi geldiği ayrımı (Kasa'ya giren zaten her zaman nakit, Kasa'dan
  -- çıkan zaten her zaman elden — o yollarda bu kolon NULL kalır).
  odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'banka_havalesi')),
  karsi_taraf_adi text,
  karsi_taraf_banka text,
  karsi_taraf_iban text,
  aciklama text,
  tutar numeric NOT NULL CHECK (tutar > 0),
  tarih date NOT NULL DEFAULT current_date,
  ekleyen_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Kaynak: Kasa XOR bir banka hesabı (ikisinden tam biri dolu olmalı).
  CONSTRAINT nakit_banka_hareketi_kaynak_xor CHECK (
    (kaynak_kasa AND kaynak_banka_hesap_id IS NULL) OR (NOT kaynak_kasa AND kaynak_banka_hesap_id IS NOT NULL)
  ),
  -- giden/gelen: hedef tamamen boş olmalı. hesaplar_arasi: hedef de Kasa XOR
  -- banka hesabı kuralına uyar.
  CONSTRAINT nakit_banka_hareketi_hedef_kural CHECK (
    (tip IN ('giden', 'gelen') AND NOT hedef_kasa AND hedef_banka_hesap_id IS NULL)
    OR (
      tip = 'hesaplar_arasi'
      AND ((hedef_kasa AND hedef_banka_hesap_id IS NULL) OR (NOT hedef_kasa AND hedef_banka_hesap_id IS NOT NULL))
    )
  ),
  -- hesaplar_arasi'nda kaynak ve hedef farklı olmalı (Kasa->Kasa ya da aynı
  -- banka hesabı->kendisi anlamsız).
  CONSTRAINT nakit_banka_hareketi_farkli_hesap CHECK (
    tip <> 'hesaplar_arasi'
    OR NOT (kaynak_kasa AND hedef_kasa)
    OR kaynak_banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id
  )
);

ALTER TABLE nakit_banka_hareketi ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_nakit_banka_hareketi_klinik_id ON nakit_banka_hareketi(klinik_id);
CREATE INDEX IF NOT EXISTS idx_nakit_banka_hareketi_kaynak_banka ON nakit_banka_hareketi(kaynak_banka_hesap_id) WHERE kaynak_banka_hesap_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nakit_banka_hareketi_hedef_banka ON nakit_banka_hareketi(hedef_banka_hesap_id) WHERE hedef_banka_hesap_id IS NOT NULL;

-- RLS: klinik_harcama/kamusal_odeme ile aynı desen — görüntüleme klinik_admin
-- + muhasebe; yönetim (ekleme/silme) sadece klinik_admin. UPDATE akışı yok
-- (manuel hareketler düzeltilmek yerine silinip yeniden girilir).
DROP POLICY IF EXISTS "nakit_banka_hareketi_select" ON nakit_banka_hareketi;
CREATE POLICY "nakit_banka_hareketi_select" ON nakit_banka_hareketi
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "nakit_banka_hareketi_yonet_admin" ON nakit_banka_hareketi;
CREATE POLICY "nakit_banka_hareketi_yonet_admin" ON nakit_banka_hareketi
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- Kontrol:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'nakit_banka_hareketi';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'nakit_banka_hareketi';
-- -- Geçersiz kombinasyon reddi örneği (ikisi de kasa olamaz, hesaplar_arasi'nda):
-- -- INSERT INTO nakit_banka_hareketi (klinik_id, tip, kaynak_kasa, hedef_kasa, tutar) VALUES ('...', 'hesaplar_arasi', true, true, 100); -- hata beklenir
