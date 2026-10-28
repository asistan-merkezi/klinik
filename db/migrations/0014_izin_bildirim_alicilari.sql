-- 0014 (elle yazıldı): izin talebi açan HER personel rolü (terapist, resepsiyon...) yöneticilere bildirim kuyruğa yazabilsin diye
-- yönetici (klinik_admin + muhasebe) iletişim bilgilerini DAR biçimde döndüren fonksiyon. `kullanici`/`personel` satırlarına doğrudan okuma yetkisi
-- genişletilmez. Yalnız çağıranın KENDİ kliniği (current_klinik_id) ve yalnız aktif personel; dönen alanlar: personel_id, telefon, eposta.
SET search_path = public, extensions;

CREATE FUNCTION izin_bildirim_alicilari(p_roller text[] DEFAULT ARRAY['klinik_admin','muhasebe'])
  RETURNS TABLE(personel_id uuid, telefon text, eposta text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_klinik_id() IS NULL OR current_rol() IS NULL THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;
  RETURN QUERY
  SELECT p.id, k.telefon, p.eposta
    FROM personel p
    JOIN kullanici k ON k.id = p.kullanici_id
   WHERE p.klinik_id = current_klinik_id() AND p.aktif
     AND k.rol::text = ANY (p_roller) AND k.rol::text IN ('klinik_admin','muhasebe');
END;
$$;
GRANT EXECUTE ON FUNCTION izin_bildirim_alicilari(text[]) TO klinik_uygulama;
