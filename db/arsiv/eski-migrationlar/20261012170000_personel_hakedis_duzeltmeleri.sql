-- Personel hakediş düzeltmeleri (2026-10-12 denetimi).
--
-- 1) Dönem yeniden açılınca o dönemin otomatik yazılmış hakediş/prim/mesai satırları duruyordu;
--    tekrar kapatınca personel_hesap_hareket_donem_ekle 'zaten_islendi' deyip yeni tutarı yazmıyor,
--    mesai de NOT EXISTS ile atlanıyordu. Yani yanlış maaş/seans/fazla mesaiyi düzeltmek için dönemi
--    yeniden açmanın tutara HİÇBİR etkisi yoktu. Artık yeniden açma bu satırları (yalnız kaynak_id =
--    dönem olanları; elle girilen prim/yol/yemek/avans/ödeme'ye dokunulmaz) siler; tekrar kapatınca
--    güncel hesapla yeniden yazılır. Silme v1 denetim tetikleyicisiyle audit_log'a düşer.
-- 2) Maaş geçmişi (personel_ucret) hakediş hesabında hiç kullanılmıyordu — her ay personelin GÜNCEL
--    maaşıyla kapanıyordu. Uygulama artık ayın son günü itibarıyla geçerli maaşı kullanıyor
--    (lib/personel/donem-maasi.ts). Geçmiş tablosundan önce eklenmiş personelin başlangıç maaşı
--    hiç kayıtlı değildi → mevcut maaşı işe giriş tarihinden geçerli ilk satır olarak geri doldurulur
--    (yalnız HİÇ geçmiş satırı olmayan personel için).
-- 3) Muhasebe Raporlar'ı ve bordroyu (salt okunur) görür ama maaş geçmişini okuyamıyordu.

-- ---------------------------------------------------------------------------
-- 1) personel_puantaj_donem_yeniden_ac
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION personel_puantaj_donem_yeniden_ac(p_personel_id uuid, p_yil integer, p_ay integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_donem_id uuid;
BEGIN
  IF NOT COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE personel_puantaj_donem
  SET durum = 'acik', kapatan_id = NULL, kapatma_tarihi = NULL
  WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay
    AND klinik_id = current_klinik_id()
    AND durum = 'kapali'
  RETURNING id INTO v_donem_id;

  IF v_donem_id IS NULL THEN
    RAISE EXCEPTION 'donem_bulunamadi_veya_zaten_acik';
  END IF;

  -- Dönem kapanışının yazdığı satırlar; tekrar kapatınca güncel hesapla yeniden yazılır.
  DELETE FROM personel_hesap_hareket
  WHERE kaynak_id = v_donem_id AND tur IN ('hakedis', 'prim', 'mesai');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Maaş geçmişi geri doldurma (yalnız hiç geçmiş satırı olmayan, maaşı tanımlı personel)
-- ---------------------------------------------------------------------------
INSERT INTO personel_ucret (klinik_id, personel_id, maas, gecerlilik_tarihi)
SELECT p.klinik_id, p.id, p.maas, COALESCE(p.ise_giris_tarihi, p.created_at::date)
FROM personel p
WHERE p.maas IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM personel_ucret u WHERE u.personel_id = p.id);

-- ---------------------------------------------------------------------------
-- 3) Muhasebe maaş geçmişini okuyabilir (bordro salt okunur)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "personel_maas_gecmisi_select" ON personel_ucret;
CREATE POLICY "personel_maas_gecmisi_select" ON personel_ucret
  FOR SELECT USING (
    (klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) IN ('klinik_admin', 'muhasebe'))
    OR EXISTS (
      SELECT 1 FROM personel p WHERE p.id = personel_ucret.personel_id AND p.kullanici_id = (SELECT auth.uid())
    )
    OR (SELECT is_super_admin())
  );
