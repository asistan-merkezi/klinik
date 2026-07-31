-- Randevu "Geldi" (check-in) işaretlendiğinde, randevunun işlem_tanimi_id'sine
-- göre otomatik bakiye/paket işleme (kullanıcı kararı):
-- - Hastanın o işlem (islem_tanimi) için geçerli (aktif, kalan_adet>0, süresi
--   dolmamış) bir paketi varsa kalan_adet 1 azaltılır, bakiyeye borç YAZILMAZ.
-- - Aksi halde islem_tanimi.fiyat tutarında hasta_bakiye_hareket'e tur='borc'
--   satırı eklenir (Cari & Ödeme > Bakiye Hareketleri'nde görünür).
-- - Randevu sonradan iptal edilse bile bu hareket/paket düşümü OTOMATİK GERİ
--   ALINMAZ (kullanıcı kararı: append-only ledger deseniyle tutarlı — odeme/
--   odeme_kalemi/odeme_satiri de hiç güncellenmiyor/silinmiyor; gerekirse
--   resepsiyon elle iade/kredi hareketi girer).
-- Atomiklik için tek bir SECURITY DEFINER RPC'de yapılıyor (durum güncelleme +
-- paket/borç mantığı) — odeme_olustur'daki aynı desen.

ALTER TABLE hasta_bakiye_hareket ADD COLUMN IF NOT EXISTS randevu_id uuid REFERENCES randevu(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hasta_bakiye_hareket_randevu_id ON hasta_bakiye_hareket(randevu_id);

-- Hangi randevunun hangi paket hakkını düştüğü (raporlama/izlenebilirlik için).
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS paket_satis_id uuid REFERENCES paket_satis(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_randevu_paket_satis_id ON randevu(paket_satis_id);

CREATE OR REPLACE FUNCTION public.randevu_gelis_isaretle(p_randevu_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_paket_satis paket_satis%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
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

  IF v_randevu.durum <> 'planlandi' THEN
    RAISE EXCEPTION 'randevu_durumu_uygun_degil';
  END IF;

  UPDATE randevu SET durum = 'geldi' WHERE id = p_randevu_id;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
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
    VALUES (v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_islem.fiyat, p_randevu_id, 'Seans ücreti: ' || v_islem.ad);

    v_sonuc := jsonb_build_object(
      'yontem', 'borc', 'hasta_id', v_randevu.hasta_id, 'tutar', v_islem.fiyat, 'islem_adi', v_islem.ad
    );
  END IF;

  RETURN v_sonuc;
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_gelis_isaretle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_gelis_isaretle(uuid) TO authenticated;
