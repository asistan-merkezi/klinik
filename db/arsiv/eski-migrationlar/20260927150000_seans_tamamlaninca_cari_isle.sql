-- Kullanıcı kararı (2026-09-27): "Geldi" işaretlenince paketsiz check-in'de
-- otomatik yazılan borç satırı KALDIRILDI. Artık check-in bakiyeye hiç
-- dokunmuyor (paket düşümü hâlâ aynı şekilde check-in anında oluyor, o zaten
-- bakiyeyi hiç etkilemiyordu). Seans bedeli artık YALNIZ seans tamamlandıktan
-- sonra, Randevu Çizelgesi'ndeki tamamlanan seans kartında "Cariye Ekle"
-- veya "Ödeme Ekle" tıklanınca bakiyeye yansıyor (bkz. randevu_seans_bedelini_isle).
--
-- randevu_gelis_isaretle'nin paketsiz dalı artık hiçbir hasta_bakiye_hareket
-- satırı yazmıyor, sadece durumu günceller — "yontem" sonucu "bekliyor" olarak
-- döner (istemci tarafında borç mesajı artık gösterilmiyor, bkz. actions.ts).
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

  IF v_randevu.paket_satis_id IS NOT NULL THEN
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

    RETURN jsonb_build_object(
      'yontem', 'paket', 'hasta_id', v_randevu.hasta_id,
      'paket_satis_id', v_paket_satis.id, 'kalan_adet', v_paket_satis.kalan_adet - 1
    );
  END IF;

  -- Paketsiz: artık burada borç YAZILMIYOR — bakiye seans tamamlanana kadar
  -- bekliyor (bkz. randevu_seans_bedelini_isle).
  RETURN jsonb_build_object('yontem', 'bekliyor', 'hasta_id', v_randevu.hasta_id);
END;
$function$;

-- ==================== randevu_seans_bedelini_isle ====================
-- Randevu Çizelgesi'nde tamamlanan (durum='tamamlandi'), paketsiz ve henüz
-- hiç işlenmemiş bir randevunun seans bedelini bakiyeye yazar. "Cariye Ekle"
-- yalnız p_randevu_id ile çağırır (borç yazılır, ödenmemiş bırakılır);
-- "Ödeme Ekle" ayrıca ödeme parametrelerini de gönderir (borç + o anda
-- tahsil edilen ödeme birlikte yazılır — cari sistemde borç/ödeme
-- eşleştirmesi yok, ikisi de bağımsız satır, net etki aynı anda görülür).
-- randevu_gelis_isaretle'deki aynı fiyat/iskonto hesabı ve FOR UPDATE kilidiyle
-- idempotency kontrolü buraya taşındı (kullanıcı kararı, 2026-09-27).
CREATE OR REPLACE FUNCTION public.randevu_seans_bedelini_isle(
  p_randevu_id uuid,
  p_odeme_tutari numeric DEFAULT NULL,
  p_odeme_yontemi text DEFAULT NULL,
  p_banka_hesap_id uuid DEFAULT NULL,
  p_aciklama text DEFAULT NULL,
  p_odeme_tarihi timestamptz DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_zaten_islendi boolean;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin();
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum != 'tamamlandi' THEN
    RAISE EXCEPTION 'seans_tamamlanmamis';
  END IF;

  v_zaten_islendi := v_randevu.paket_satis_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc'
  );
  IF v_zaten_islendi THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

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
    'Seans ücreti: ' || v_islem.ad
  );

  IF p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN
    IF p_odeme_yontemi IS NULL OR p_odeme_yontemi NOT IN ('nakit', 'kredi_karti', 'banka_havalesi') THEN
      RAISE EXCEPTION 'odeme_yontemi_gecersiz';
    END IF;

    INSERT INTO hasta_bakiye_hareket (
      klinik_id, hasta_id, tur, tutar, randevu_id, aciklama, odeme_yontemi, banka_hesap_id, created_at
    )
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'odeme', p_odeme_tutari, p_randevu_id, p_aciklama,
      p_odeme_yontemi, p_banka_hesap_id, COALESCE(p_odeme_tarihi, now())
    );
  END IF;

  RETURN jsonb_build_object(
    'yontem', CASE WHEN p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN 'odeme' ELSE 'cari' END,
    'hasta_id', v_randevu.hasta_id, 'tutar', v_fiyat, 'iskonto_tutari', v_iskonto
  );
END;
$function$;

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname IN ('randevu_gelis_isaretle', 'randevu_seans_bedelini_isle');
