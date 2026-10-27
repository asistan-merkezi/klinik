-- 0009 (elle yazıldı): randevu yazarken terapistin o gün çalışabilir olup olmadığı için DAR fonksiyon (docs/service-role-siniflama.md #15).
-- Eskiden servis rolüyle (RLS dışı) personel_izin_talebi ve personel_puantaj okunuyordu: resepsiyon/terapist başka personelin izin kaydını
-- RLS nedeniyle göremez, ama randevu atamak için "o gün izinli mi" bilgisine ihtiyaç duyar. Bu fonksiyon YALNIZ tarih bilgisi döndürür:
-- izin türü, gerekçe, belge ve puantaj durumunun KENDİSİ (izinli mi raporlu mu — sağlık verisi sayılabilir) dışarı çıkmaz.
SET search_path = public, extensions;

CREATE FUNCTION terapist_uygunluk_getir(p_terapist_id uuid, p_bas date, p_bit date) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
$$
DECLARE
  v_personel uuid;
  v_cikis date;
  v_klinik uuid := current_klinik_id();
BEGIN
  -- Yalnız randevu yazabilen roller (RLS randevu_insert_yetkili ile aynı küme); klinik bağlamı olmayan çağrı sonuç görmez.
  IF v_klinik IS NULL OR current_rol() IS NULL OR current_rol() NOT IN ('klinik_admin', 'resepsiyon', 'terapist') THEN
    RETURN NULL;
  END IF;
  IF p_bas IS NULL OR p_bit IS NULL OR p_bit < p_bas OR p_bit - p_bas > 400 THEN
    RAISE EXCEPTION 'gecersiz_aralik' USING ERRCODE = '22023';
  END IF;

  SELECT t.personel_id, p.isten_cikis_tarihi INTO v_personel, v_cikis
  FROM terapist t JOIN personel p ON p.id = t.personel_id
  WHERE t.id = p_terapist_id AND t.klinik_id = v_klinik;
  IF NOT FOUND THEN RETURN NULL; END IF;  -- terapist yok ya da başka kliniğin

  RETURN jsonb_build_object(
    'cikis_tarihi', v_cikis,
    'izinli_gunler', COALESCE((
      SELECT jsonb_agg(DISTINCT g::date ORDER BY g::date)
      FROM (
        SELECT generate_series(GREATEST(i.baslangic_tarih, p_bas), LEAST(i.bitis_tarih, p_bit), interval '1 day') AS g
        FROM personel_izin_talebi i
        WHERE i.personel_id = v_personel AND i.klinik_id = v_klinik AND i.durum = 'onaylandi'
          AND i.baslangic_tarih <= p_bit AND i.bitis_tarih >= p_bas
        UNION ALL
        SELECT pu.tarih FROM personel_puantaj pu
        WHERE pu.personel_id = v_personel AND pu.klinik_id = v_klinik AND pu.durum IN ('izinli', 'raporlu')
          AND pu.tarih BETWEEN p_bas AND p_bit
      ) x
    ), '[]'::jsonb)
  );
END
$$;
REVOKE ALL ON FUNCTION terapist_uygunluk_getir(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION terapist_uygunluk_getir(uuid, date, date) TO klinik_uygulama;
