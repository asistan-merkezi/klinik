-- Randevu durum geçişleri: paket hakkı ve kapalı randevu korumaları (2026-10-12 denetimi).
--
-- 1) randevu_gelis_isaretle mevcut durumu kontrol etmiyordu: İPTAL edilmiş (bedelli iptalde paketi
--    düşülmüş / borcu yazılmış) ya da TAMAMLANMIŞ bir randevu "Geldi" yapılabiliyordu. İptalden
--    çıkışın tek yolu randevu_iptal_geri_al (yönetici, hak iadesi + borç silme); tamamlanmış seans
--    kapanmıştır. Artık ikisi de 'randevu_kapali' ile reddedilir.
-- 2) "Gelmedi" düz bir UPDATE'ti: önce "Geldi" denip paketten hak düşüldükten sonra yanlışlık
--    düzeltilip "Gelmedi" yapılınca hak iade EDİLMİYORDU (hasta kullanmadığı seansı kaybediyordu).
--    Yeni randevu_gelmedi_isaretle: check-in'de düşülen hakkı iade eder (paket_satis_id temizlenir,
--    sonra tekrar "Geldi" denirse yeniden düşülür). İptal/tamamlanmış randevuda reddedilir.
--    Not: gelmeyen hastadan seans düşmek isteniyorsa yol BEDELLİ İPTAL'dir (değişmedi).
-- 3) Bedelsiz iptal "hiçbir şeye dokunmaz" diyordu ama check-in'de paketten düşülmüş hak (randevu
--    "Geldi" iken iptal) iade edilmiyordu — bedelsiz iptalde hasta seansını kaybediyordu. Artık iade
--    edilir. Bedelli iptalde (check-in'de düşülmüşse ikinci kez düşülmez) davranış değişmedi.

-- ==================== 1) randevu_gelis_isaretle (durum koruması eklendi) ====================
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

  IF v_randevu.durum IN ('iptal', 'tamamlandi') THEN
    RAISE EXCEPTION 'randevu_kapali';
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

  -- Paketsiz: bakiye seans tamamlanana kadar bekler (bkz. randevu_seans_bedelini_isle).
  RETURN jsonb_build_object('yontem', 'bekliyor', 'hasta_id', v_randevu.hasta_id);
END;
$function$;

-- ==================== 2) randevu_gelmedi_isaretle (yeni) ====================
CREATE OR REPLACE FUNCTION public.randevu_gelmedi_isaretle(p_randevu_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_iade boolean := false;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = current_klinik_id() OR is_super_admin()) THEN
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

  IF v_randevu.durum IN ('iptal', 'tamamlandi') THEN
    RAISE EXCEPTION 'randevu_kapali';
  END IF;

  -- Check-in'de düşülen paket hakkı iade edilir (gelmeyen hastanın seansı düşülmez).
  IF v_randevu.paket_satis_id IS NOT NULL THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
    v_iade := true;
  END IF;

  UPDATE randevu
  SET durum = 'gelmedi', gecikme_dakika = NULL, paket_satis_id = NULL
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'paket_iade', v_iade);
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_gelmedi_isaretle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.randevu_gelmedi_isaretle(uuid) TO authenticated;

-- ==================== 3) randevu_iptal_et (bedelsiz iptalde check-in hakkı iadesi) ====================
-- İmza ve parametre adları AYNI (CREATE OR REPLACE güvenli, overload oluşmaz).
CREATE OR REPLACE FUNCTION public.randevu_iptal_et(
  p_randevu_id uuid,
  p_aciklama text DEFAULT NULL,
  p_bedelli boolean DEFAULT false,
  p_gec_iptal boolean DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_gec boolean;
  v_paket paket_satis%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
  v_dusuldu boolean := false;
  v_borc boolean := false;
  v_iade boolean := false;
  v_aciklama text := NULLIF(btrim(COALESCE(p_aciklama, '')), '');
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = current_klinik_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND NOT COALESCE(p_bedelli, false) AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = auth.uid()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum = 'iptal' THEN
    RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'zaten_iptal', true,
      'bedelli', v_randevu.bedelli_iptal, 'paket_dusuldu', v_randevu.iptal_paket_dusuldu,
      'borc_yazildi', v_randevu.iptal_borc_yazildi);
  END IF;
  IF v_randevu.durum = 'tamamlandi' THEN
    RAISE EXCEPTION 'tamamlanmis_randevu_iptal_edilemez';
  END IF;

  v_gec := COALESCE(p_gec_iptal, (v_randevu.baslangic - now()) < interval '18 hours');

  IF COALESCE(p_bedelli, false) THEN
    v_aciklama := CASE WHEN v_aciklama IS NULL THEN '(geç iptal)' ELSE v_aciklama || ' (geç iptal)' END;

    -- Check-in'de zaten paketten düşüldüyse (paket_satis_id dolu) ikinci kez düşülmez.
    IF v_randevu.paket_satis_id IS NULL AND v_randevu.islem_tanimi_id IS NOT NULL AND v_randevu.hasta_id IS NOT NULL THEN
      SELECT ps.* INTO v_paket
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
        WHERE id = v_paket.id;
        v_dusuldu := true;
      ELSE
        -- Paket yok: normal seans gibi bedeli bakiyeye borç olarak işle
        -- (randevu_seans_bedelini_isle ile aynı fiyat/iskonto hesabı; mükerrer yazılmaz).
        IF NOT EXISTS (SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc') THEN
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
            'Seans ücreti (geç iptal): ' || v_islem.ad
          );
          v_borc := true;
        END IF;
      END IF;
    END IF;
  ELSIF v_randevu.paket_satis_id IS NOT NULL THEN
    -- Bedelsiz iptal: check-in'de düşülmüş hak hastaya iade edilir.
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
    v_iade := true;
  END IF;

  UPDATE randevu
  SET durum = 'iptal',
      iptal_aciklamasi = v_aciklama,
      iptal_tarihi = now(),
      iptal_eden_kullanici_id = auth.uid(),
      gec_iptal = v_gec,
      bedelli_iptal = COALESCE(p_bedelli, false),
      iptal_paket_dusuldu = v_dusuldu,
      iptal_borc_yazildi = v_borc,
      paket_satis_id = CASE WHEN v_dusuldu THEN v_paket.id WHEN v_iade THEN NULL ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'bedelli', COALESCE(p_bedelli, false),
    'paket_dusuldu', v_dusuldu, 'borc_yazildi', v_borc, 'paket_iade', v_iade);
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) TO authenticated;
