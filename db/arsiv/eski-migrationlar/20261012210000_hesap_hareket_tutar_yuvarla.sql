-- personel_hesap_hareket.tutar sınırsız numeric: fazla mesai (saat × saatlik ücret) gibi hesaplar
-- kuruş altı ondalık yazabiliyordu (ör. 123.456789). Tüm yazma yollarını (dönem kapanışı RPC'leri, manuel ekleme)
-- tek noktadan kapsamak için BEFORE INSERT/UPDATE tetikleyicisi tutarı 2 ondalığa yuvarlar.
-- Mevcut satırlara dokunmaz (geriye dönük düzeltme yok — gerekirse elle: update ... set tutar = round(tutar, 2)).
--
-- UYGULAMA SIRASI: kod bu migration'a BAĞLI DEĞİL (uygulanmadan da çalışır); serbestçe uygulanabilir.

CREATE OR REPLACE FUNCTION personel_hesap_hareket_tutar_yuvarla()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tutar := round(NEW.tutar, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personel_hesap_hareket_tutar_yuvarla ON personel_hesap_hareket;
CREATE TRIGGER trg_personel_hesap_hareket_tutar_yuvarla
  BEFORE INSERT OR UPDATE OF tutar ON personel_hesap_hareket
  FOR EACH ROW EXECUTE FUNCTION personel_hesap_hareket_tutar_yuvarla();

-- Kontrol (uygulandıktan sonra, service_role ile geçici satır yazıp silerek):
--   insert ... tutar = 10.456 → okunan tutar 10.46
-- Mevcut kuruş altı satır var mı?
--   SELECT count(*) FROM personel_hesap_hareket WHERE tutar <> round(tutar, 2);
