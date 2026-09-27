-- Yeni Randevu formunda Tedavi seçilince (bkz. randevu-formu.tsx) resepsiyon
-- artık o hasta/tedavi için sunucuda hesaplanan tedavi bedelinin yanında bir
-- iskonto da planlayabiliyor. Bu tutar randevu'ya yazılıyor ve yalnız
-- PAKETSİZ check-in'de (randevu_gelis_isaretle'nin borç dalı) okunup doğrudan
-- oluşan hasta_bakiye_hareket satırının iskonto_tutari'na yazılıyor — kullanıcı
-- kararı: cari sistem üç kez yeniden tasarlandı, burada YENİ bir iskonto
-- mekanizması icat etmek yerine mevcut borç satırı iskonto kolonunu (bkz.
-- 20260813150000_borc_duzenle_iskonto_kolonu.sql) doğrudan dolduruyoruz —
-- resepsiyon check-in sonrası Cari & Ödeme'den ayrıca iskonto girmek zorunda
-- kalmıyor, ama isterse orada üzerine yazabilir (hasta_bakiye_hareket_borc_duzenle
-- hâlâ aynen çalışıyor). Paketli check-in'de zaten hiç borç satırı oluşmadığı
-- için bu alan sessizce kullanılmaz (bilinçli boşluk — paket varsa iskonto
-- kavramı paket fiyatına dahil).
ALTER TABLE randevu
  ADD COLUMN IF NOT EXISTS planlanan_iskonto_tutari numeric(10, 2)
    CHECK (planlanan_iskonto_tutari IS NULL OR planlanan_iskonto_tutari >= 0);

CREATE OR REPLACE FUNCTION public.randevu_gelis_isaretle(p_randevu_id uuid, p_gecikme_dakika integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_yeni_durum randevu_durum_tipi;
  v_paket_satis paket_satis%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
  v_zaten_islendi boolean;
  v_sonuc jsonb;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = auth.uid()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yeni_durum := CASE WHEN p_gecikme_dakika IS NOT NULL THEN 'gecikmeli_geldi' ELSE 'geldi' END;
  UPDATE randevu SET durum = v_yeni_durum, gecikme_dakika = p_gecikme_dakika WHERE id = p_randevu_id;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

  v_zaten_islendi := v_randevu.paket_satis_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc'
  );
  IF v_zaten_islendi THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  SELECT ps.* INTO v_paket_satis
  FROM paket_satis ps
  JOIN paket p ON p.id = ps.paket_id
  WHERE ps.hasta_id = v_randevu.hasta_id
    AND ps.klinik_id = v_randevu.klinik_id
    AND p.islem_tanimi_id = v_randevu.islem_tanimi_id
    AND ps.durum = 'aktif'
    AND ps.kalan_adet > 0
  ORDER BY ps.satis_tarihi ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet - 1,
        durum = CASE WHEN kalan_adet - 1 <= 0 THEN 'bitti' ELSE durum END,
        updated_at = now()
    WHERE id = v_paket_satis.id;

    UPDATE randevu SET paket_satis_id = v_paket_satis.id WHERE id = p_randevu_id;

    v_sonuc := jsonb_build_object(
      'yontem', 'paket', 'hasta_id', v_randevu.hasta_id,
      'paket_satis_id', v_paket_satis.id, 'kalan_adet', v_paket_satis.kalan_adet - 1
    );
  ELSE
    SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
    v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, v_randevu.hasta_id);
    v_iskonto := LEAST(GREATEST(COALESCE(v_randevu.planlanan_iskonto_tutari, 0), 0), v_fiyat);

    INSERT INTO hasta_bakiye_hareket (
      klinik_id, hasta_id, tur, tutar, iskonto_tutari, iskonto_uygulayan_kullanici_id, randevu_id, aciklama
    )
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_fiyat, v_iskonto,
      CASE WHEN v_iskonto > 0 THEN v_randevu.olusturan_kullanici_id ELSE NULL END,
      p_randevu_id,
      'Seans ücreti: ' || v_islem.ad ||
        CASE WHEN p_gecikme_dakika IS NOT NULL THEN format(' (gecikmeli geliş, %s dk)', p_gecikme_dakika) ELSE '' END
    );

    v_sonuc := jsonb_build_object(
      'yontem', 'borc', 'hasta_id', v_randevu.hasta_id, 'tutar', v_fiyat,
      'iskonto_tutari', v_iskonto, 'islem_adi', v_islem.ad
    );
  END IF;

  RETURN v_sonuc;
END;
$function$;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'randevu' AND column_name = 'planlanan_iskonto_tutari';
