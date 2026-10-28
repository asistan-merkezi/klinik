-- Ödeme Alma akışı: tek işlemde odeme + odeme_kalemi + (gerekirse) paket_satis +
-- odeme_satiri + musteri_bakiye_hareket yazan atomik fonksiyon. Uygulama katmanında
-- bugüne kadar çoklu tablo yazımı yoktu (randevu çakışması bile tek insert + DB
-- exclusion constraint ile çözülüyor); bu akış gerçek bir transaction gerektirdiği
-- için ilk kez bir Postgres fonksiyonu (RPC) kullanılıyor.
--
-- Kapsam kararları (bkz. CLAUDE.md "Yol Haritası / Durum"):
-- - Ödeme tam tutarda olmalı (odeme_satiri toplamı = kalemler toplamı - iskonto);
--   kısmi/taksitli ödeme bu turda desteklenmiyor.
-- - Her tamamlanan ödeme musteri_bakiye_hareket'e tur='odeme' olarak audit-trail
--   amaçlı yazılır; "bakiye" (kredi/borç netleşmesi) kavramı henüz UI'da yok.
-- - Serbest/özel kalem (ne işlem ne paket) desteklenmiyor.

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

  RETURN v_odeme_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) TO authenticated;
