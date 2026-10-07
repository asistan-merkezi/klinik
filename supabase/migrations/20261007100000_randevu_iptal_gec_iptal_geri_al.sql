-- Randevu iptali: açıklama + "geç iptal" (başlangıca 18 saatten az kala) + yönetici geri alma.
--
-- Kullanıcı kararı (2026-10-07):
--  * İptal artık anında değil, panelde "Kaydet" ile işlenir (istemci tarafı).
--  * Başlangıca < 18 saat kala iptal "geç iptal"dir: seans sayılır — hastanın
--    uygun aktif paketi varsa 1 hak düşer (paketsizde bakiyeye dokunulmaz).
--  * Mantıklı bir sebep varsa yönetici (klinik_admin) iptali geri alabilir;
--    düşülen paket hakkı iade edilir.
--  * Hasta portal iptal talebi de aynı uyarıyı görür; talep açıklama taşır,
--    "geç iptal" bilgisi talep anında sunucuda (trigger) hesaplanır, resepsiyon
--    onaylayınca aynı RPC çalışır.
--
-- NOT: Bu migration uygulanmadan ilgili uygulama kodu deploy EDİLMEMELİ
-- (RANDEVU_SELECT yeni kolonları okur).

ALTER TABLE randevu
  ADD COLUMN IF NOT EXISTS iptal_aciklamasi text,
  ADD COLUMN IF NOT EXISTS iptal_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS iptal_eden_kullanici_id uuid REFERENCES kullanici(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gec_iptal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iptal_paket_dusuldu boolean NOT NULL DEFAULT false;

ALTER TABLE randevu_iptal_talebi
  ADD COLUMN IF NOT EXISTS aciklama text,
  ADD COLUMN IF NOT EXISTS gec_iptal boolean NOT NULL DEFAULT false;

-- Talep anında geç iptal bilgisini sunucu hesaplar (istemciye güvenilmez).
CREATE OR REPLACE FUNCTION public.randevu_iptal_talebi_gec_iptal_ata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT (r.baslangic - now()) < interval '18 hours' INTO NEW.gec_iptal
  FROM randevu r WHERE r.id = NEW.randevu_id;
  NEW.gec_iptal := COALESCE(NEW.gec_iptal, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_randevu_iptal_talebi_gec_iptal ON randevu_iptal_talebi;
CREATE TRIGGER trg_randevu_iptal_talebi_gec_iptal
  BEFORE INSERT ON randevu_iptal_talebi
  FOR EACH ROW EXECUTE FUNCTION public.randevu_iptal_talebi_gec_iptal_ata();

-- ==================== randevu_iptal_et ====================
-- p_gec_iptal: NULL ise başlangıca göre şimdi hesaplanır; talep onayında talebin
-- (talep anındaki) değeri verilir. Geç iptalde p_gec_onay=true şart (sunucu tarafı
-- koruması — istemci uyarısı atlanamasın).
CREATE OR REPLACE FUNCTION public.randevu_iptal_et(
  p_randevu_id uuid,
  p_aciklama text DEFAULT NULL,
  p_gec_onay boolean DEFAULT false,
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
  v_dusuldu boolean := false;
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
    current_rol() = 'terapist' AND EXISTS (
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
      'gec_iptal', v_randevu.gec_iptal, 'paket_dusuldu', v_randevu.iptal_paket_dusuldu);
  END IF;
  IF v_randevu.durum = 'tamamlandi' THEN
    RAISE EXCEPTION 'tamamlanmis_randevu_iptal_edilemez';
  END IF;

  v_gec := COALESCE(p_gec_iptal, (v_randevu.baslangic - now()) < interval '18 hours');

  IF v_gec THEN
    IF NOT COALESCE(p_gec_onay, false) THEN
      RAISE EXCEPTION 'gec_iptal_onay_gerekli';
    END IF;
    IF v_aciklama IS NULL THEN
      RAISE EXCEPTION 'gec_iptal_aciklama_gerekli';
    END IF;

    -- Seans sayılır: check-in'de zaten paketten düşülmediyse uygun aktif paketten (FIFO) 1 hak.
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
      END IF;
    END IF;
  END IF;

  UPDATE randevu
  SET durum = 'iptal',
      iptal_aciklamasi = v_aciklama,
      iptal_tarihi = now(),
      iptal_eden_kullanici_id = auth.uid(),
      gec_iptal = v_gec,
      iptal_paket_dusuldu = v_dusuldu,
      paket_satis_id = CASE WHEN v_dusuldu THEN v_paket.id ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'gec_iptal', v_gec, 'paket_dusuldu', v_dusuldu);
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_iptal_et(uuid, text, boolean, boolean) TO authenticated;

-- ==================== randevu_iptal_geri_al ====================
-- Yalnız klinik_admin. İptali kaldırır (durum -> planlandi), geç iptalde düşülen
-- paket hakkını iade eder. Eski saat başka bir randevuyla çakışıyorsa exclusion
-- constraint (23P01) hatası verir — istemci mesaja çevirir.
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
      iptal_paket_dusuldu = false,
      paket_satis_id = CASE WHEN v_randevu.iptal_paket_dusuldu THEN NULL ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'paket_iade', v_randevu.iptal_paket_dusuldu);
END;
$function$;

REVOKE ALL ON FUNCTION public.randevu_iptal_geri_al(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_iptal_geri_al(uuid) TO authenticated;
