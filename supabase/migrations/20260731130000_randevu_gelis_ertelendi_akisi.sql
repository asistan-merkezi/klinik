-- randevu_gelis_isaretle: 'gecikmeli_geldi'yi de destekleyecek şekilde
-- genişletildi. p_gecikme_dakika verilirse durum='gecikmeli_geldi', aksi
-- halde 'geldi' olur — ikisi de AYNI paket/borç mantığını çalıştırır
-- (kullanıcı kararı: gecikmeli geliş de fiilen bir geliştir).
--
-- Ayrıca artık randevunun ÖNCEKİ durumu ne olursa olsun çağrılabilir (önceki
-- "sadece planlandi'dan" kısıtlaması kaldırıldı — kullanıcı kararı: Randevu
-- Detay panelindeki 5 sonuç seçeneği (Geldi/Gecikmeli Geldi/Gelmedi/
-- Ertelendi/İptal) her zaman tıklanabilir olmalı, resepsiyon yanlış
-- işaretlemeyi serbestçe düzeltebilmeli). Bu yüzden aynı randevu için paket/
-- borç mantığının TEKRAR çalışmaması adına idempotency kontrolü eklendi:
-- randevu.paket_satis_id doluysa veya hasta_bakiye_hareket'te bu randevu_id
-- için zaten 'borc' satırı varsa, sadece durum güncellenir, paket/borç
-- mantığı tekrar işlenmez.
DROP FUNCTION IF EXISTS public.randevu_gelis_isaretle(uuid);

CREATE FUNCTION public.randevu_gelis_isaretle(p_randevu_id uuid, p_gecikme_dakika integer DEFAULT NULL)
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
    AND ps.gecerlilik_bitis_tarihi >= current_date
  ORDER BY ps.gecerlilik_bitis_tarihi ASC
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

    INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, randevu_id, aciklama)
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_islem.fiyat, p_randevu_id,
      'Seans ücreti: ' || v_islem.ad ||
        CASE WHEN p_gecikme_dakika IS NOT NULL THEN format(' (gecikmeli geliş, %s dk)', p_gecikme_dakika) ELSE '' END
    );

    v_sonuc := jsonb_build_object(
      'yontem', 'borc', 'hasta_id', v_randevu.hasta_id, 'tutar', v_islem.fiyat, 'islem_adi', v_islem.ad
    );
  END IF;

  RETURN v_sonuc;
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_gelis_isaretle(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_gelis_isaretle(uuid, integer) TO authenticated;
