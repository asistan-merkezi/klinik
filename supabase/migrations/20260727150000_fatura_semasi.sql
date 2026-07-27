-- Paraşüt fatura kuyruğu (bkz. CLAUDE.md "Yol Haritası / Durum").
-- Gerçek Paraşüt API client'ı henüz yazılmadı (hesap/kimlik bilgisi yok, resmi
-- API dokümantasyonu bu ortamdan doğrulanamadı) — bu migration sadece durum
-- takibi için kuyruk tablosunu ve ödeme akışına bağlanan tetikleme noktasını
-- kurar. `fatura.durum='bekliyor'` kayıtları, gerçek entegrasyon yazılana kadar
-- "Faturayı Kes" butonuyla manuel tetiklenmeye çalışılır ama client yokken
-- net bir "henüz bağlı değil" mesajıyla geri döner (accounting-sync kuralı:
-- hatalı/eksik olan otomatik tekrar denenmez, insan kararına düşer).

CREATE TABLE IF NOT EXISTS fatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klinik_id uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
  odeme_id uuid NOT NULL REFERENCES odeme(id) ON DELETE CASCADE,
  durum text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'kesildi', 'hata')),
  parasut_fatura_no text,
  e_arsiv_pdf_url text,
  hata_mesaji text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fatura ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fatura_klinik_id ON fatura(klinik_id);
CREATE INDEX IF NOT EXISTS idx_fatura_odeme_id ON fatura(odeme_id);

DROP TRIGGER IF EXISTS trg_fatura_updated_at ON fatura;
CREATE TRIGGER trg_fatura_updated_at BEFORE UPDATE ON fatura
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP POLICY IF EXISTS "fatura_select_klinik" ON fatura;
CREATE POLICY "fatura_select_klinik" ON fatura
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "fatura_ekle_resepsiyon_admin" ON fatura;
CREATE POLICY "fatura_ekle_resepsiyon_admin" ON fatura
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

DROP POLICY IF EXISTS "fatura_guncelle_resepsiyon_admin" ON fatura;
CREATE POLICY "fatura_guncelle_resepsiyon_admin" ON fatura
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon')) OR is_super_admin()
  );

-- odeme_olustur: faturali=true ise aynı transaction'da fatura satırı da oluşsun.
-- Fonksiyon gövdesi 20260727120000_odeme_olustur_fonksiyonu.sql ile aynı,
-- sadece musteri_bakiye_hareket insert'inden sonra tek bir INSERT eklendi.
CREATE OR REPLACE FUNCTION odeme_olustur(
  p_musteri_id uuid,
  p_iskonto_tutari numeric,
  p_faturali boolean,
  p_aciklama text,
  p_kalemler jsonb,
  p_satirlar jsonb
)
RETURNS uuid AS $$
DECLARE
  v_klinik_id uuid;
  v_odeme_id uuid;
  v_kalem jsonb;
  v_satir jsonb;
  v_islem islem_tanimi%ROWTYPE;
  v_paket paket%ROWTYPE;
  v_paket_satis_id uuid;
  v_miktar integer;
  v_kalem_toplam numeric := 0;
  v_satir_toplam numeric := 0;
  v_net_toplam numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM musteri WHERE id = p_musteri_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'musteri_bulunamadi';
  END IF;

  INSERT INTO odeme (klinik_id, musteri_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, p_musteri_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
  RETURNING id INTO v_odeme_id;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_miktar := GREATEST(COALESCE((v_kalem->>'miktar')::integer, 1), 1);

    IF v_kalem->>'tur' = 'islem' THEN
      SELECT * INTO v_islem FROM islem_tanimi
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_islem.id, v_miktar, v_islem.fiyat, v_islem.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_islem.fiyat * v_miktar;

    ELSIF v_kalem->>'tur' = 'paket' THEN
      SELECT * INTO v_paket FROM paket
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO paket_satis (klinik_id, musteri_id, paket_id, odeme_id, kalan_adet, gecerlilik_bitis_tarihi)
      VALUES (v_klinik_id, p_musteri_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi, current_date + v_paket.gecerlilik_gun)
      RETURNING id INTO v_paket_satis_id;

      INSERT INTO odeme_kalemi (odeme_id, paket_satis_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_paket_satis_id, 1, v_paket.fiyat, v_paket.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_paket.fiyat;

    ELSE
      RAISE EXCEPTION 'gecersiz_kalem_turu';
    END IF;
  END LOOP;

  IF v_kalem_toplam = 0 THEN
    RAISE EXCEPTION 'kalem_yok';
  END IF;

  v_net_toplam := v_kalem_toplam - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  FOR v_satir IN SELECT * FROM jsonb_array_elements(p_satirlar)
  LOOP
    INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
    VALUES (v_odeme_id, v_satir->>'yontem', (v_satir->>'tutar')::numeric);

    v_satir_toplam := v_satir_toplam + (v_satir->>'tutar')::numeric;
  END LOOP;

  IF v_satir_toplam <> v_net_toplam THEN
    RAISE EXCEPTION 'odeme_tutari_uyusmuyor';
  END IF;

  INSERT INTO musteri_bakiye_hareket (klinik_id, musteri_id, tur, tutar, odeme_id, aciklama)
  VALUES (v_klinik_id, p_musteri_id, 'odeme', v_net_toplam, v_odeme_id, p_aciklama);

  IF p_faturali THEN
    INSERT INTO fatura (klinik_id, odeme_id, durum)
    VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
  END IF;

  RETURN v_odeme_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) TO authenticated;
