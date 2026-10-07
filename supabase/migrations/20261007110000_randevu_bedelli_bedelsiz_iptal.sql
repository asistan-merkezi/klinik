-- Randevu iptali: otomatik "geç iptal" yerine personelin seçtiği BEDELLİ / BEDELSİZ iptal.
--
-- Kullanıcı kararı (2026-10-07):
--  * İptal seçilince "Kaydet" yerine "Bedelli İptal" ve "Bedelsiz İptal" butonları çıkar.
--  * Bedelli iptal: hastanın uygun aktif paketi varsa paketten 1 hak düşer; yoksa
--    (normal seans) seans bedeli bakiyeye BORÇ olarak işlenir. Açıklamaya "(geç iptal)"
--    eklenir. Bedelsiz iptal hiçbir şeye dokunmaz.
--  * Hasta portalı iptal talepleri de bildirimlerde aynı iki seçenekle onaylanır.
--  * Yönetici geri alınca düşülen paket hakkı iade edilir / yazılan borç satırı silinir.
--
-- Eski imza (uuid, text, boolean, boolean) parametre ADI değiştiği için önce DROP
-- (aksi halde CREATE OR REPLACE hata verir; farklı imza ise overload yaratıp PGRST203'e
-- yol açardı — bkz. CLAUDE.md > Bilinen Tuzaklar).
--
-- NOT: Bu migration uygulanmadan ilgili uygulama kodu deploy EDİLMEMELİ.

ALTER TABLE randevu
  ADD COLUMN IF NOT EXISTS bedelli_iptal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iptal_borc_yazildi boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.randevu_iptal_et(uuid, text, boolean, boolean);

-- p_gec_iptal: yalnız bilgi amaçlı (başlangıca 18 saatten az kala mı); NULL ise şimdi hesaplanır,
-- talep onayında talebin kendi değeri verilir. Karar p_bedelli ile personelden gelir.
CREATE FUNCTION public.randevu_iptal_et(
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
      paket_satis_id = CASE WHEN v_dusuldu THEN v_paket.id ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'bedelli', COALESCE(p_bedelli, false),
    'paket_dusuldu', v_dusuldu, 'borc_yazildi', v_borc);
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) TO authenticated;

-- ==================== randevu_iptal_geri_al ====================
-- Düşülen paket hakkını iade eder VE iptalde yazılan borç satırını siler (faturalanmışsa
-- geri alınamaz — önce fatura/borç düzeltilmeli).
CREATE OR REPLACE FUNCTION public.randevu_iptal_geri_al(p_randevu_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT ((v_randevu.klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum <> 'iptal' THEN
    RAISE EXCEPTION 'randevu_iptal_degil';
  END IF;

  IF v_randevu.iptal_borc_yazildi THEN
    IF EXISTS (
      SELECT 1 FROM hasta_bakiye_hareket
      WHERE randevu_id = p_randevu_id AND tur = 'borc' AND odeme_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'borc_faturali_geri_alinamaz';
    END IF;
    DELETE FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc';
  END IF;

  IF v_randevu.iptal_paket_dusuldu AND v_randevu.paket_satis_id IS NOT NULL THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
  END IF;

  UPDATE randevu
  SET durum = 'planlandi',
      iptal_aciklamasi = NULL,
      iptal_tarihi = NULL,
      iptal_eden_kullanici_id = NULL,
      gec_iptal = false,
      bedelli_iptal = false,
      iptal_paket_dusuldu = false,
      iptal_borc_yazildi = false,
      paket_satis_id = CASE WHEN v_randevu.iptal_paket_dusuldu THEN NULL ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id,
    'paket_iade', v_randevu.iptal_paket_dusuldu, 'borc_silindi', v_randevu.iptal_borc_yazildi);
END;
$function$;
