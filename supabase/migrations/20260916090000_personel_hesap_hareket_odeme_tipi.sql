-- Kasa/Banka özelliği: personel nakit/havale ödemelerinin (avans, ödeme)
-- kasa mutabakatına dahil edilebilmesi için personel_hesap_hareket'e ödeme
-- tipi + banka hesabı eklenir — klinik_harcama'daki desenin birebir aynısı
-- (bkz. 20260914090000_klinik_harcama_genisletme.sql). Otomatik yazılan
-- satırlar (hakedis/prim/mesai, personel_hesap_hareket_donem_ekle ve
-- personel_puantaj_donem_kapat'tan) bu kolonlara hiç değer vermez, NULL kalır
-- — ödeme tipi sadece elle eklenen avans/ödeme satırlarında anlamlı.
-- İdempotent, tek blok.

ALTER TABLE personel_hesap_hareket
  ADD COLUMN IF NOT EXISTS odeme_tipi text CHECK (odeme_tipi IN ('nakit', 'havale')),
  ADD COLUMN IF NOT EXISTS banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;

-- personel_hesap_hareket_ekle RPC'sine p_odeme_tipi/p_banka_hesap_id eklenir
-- (CREATE OR REPLACE, imza parametre eklemekle uyumlu çünkü hepsi DEFAULT'lu
-- — eski çağrılar değişmeden çalışmaya devam eder). Gövde aynı kalıyor,
-- sadece insert listesine iki kolon ekleniyor.
CREATE OR REPLACE FUNCTION personel_hesap_hareket_ekle(
  p_personel_id uuid,
  p_tur text,
  p_tutar numeric,
  p_tarih date DEFAULT current_date,
  p_aciklama text DEFAULT NULL,
  p_odeme_tipi text DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_personel personel%rowtype;
  v_yeni_id uuid;
BEGIN
  IF NOT coalesce(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_tur = 'hakedis' THEN
    RAISE EXCEPTION 'hakedis_elle_eklenemez';
  END IF;

  IF p_tur NOT IN ('prim', 'yol', 'yemek', 'mesai', 'avans', 'kesinti', 'odeme') THEN
    RAISE EXCEPTION 'tur_gecersiz';
  END IF;

  IF p_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;

  IF p_odeme_tipi IS NOT NULL AND p_odeme_tipi NOT IN ('nakit', 'havale') THEN
    RAISE EXCEPTION 'odeme_tipi_gecersiz';
  END IF;

  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id;
  IF NOT found OR (v_personel.klinik_id <> current_klinik_id() AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  INSERT INTO personel_hesap_hareket
    (klinik_id, personel_id, tur, tutar, tarih, aciklama, ekleyen_kullanici_id, odeme_tipi, banka_hesap_id)
  VALUES (
    v_personel.klinik_id, p_personel_id, p_tur, p_tutar, p_tarih, p_aciklama, auth.uid(),
    p_odeme_tipi,
    CASE WHEN p_odeme_tipi = 'havale' THEN p_banka_hesap_id ELSE NULL END
  )
  RETURNING id INTO v_yeni_id;

  RETURN v_yeni_id;
END;
$$;

-- Kontrol:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'personel_hesap_hareket' ORDER BY ordinal_position;
-- SELECT pg_get_functiondef('personel_hesap_hareket_ekle(uuid,text,numeric,date,text,text,uuid)'::regprocedure);
