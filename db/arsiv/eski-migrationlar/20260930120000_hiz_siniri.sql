-- Public QR uçları (hasta ön kayıt, anket, puantaj PIN) için hız sınırı.
-- Sabit pencereli sayaç; ek altyapı (Redis vb.) gerektirmez.
--
-- Güvenlik: fonksiyon YALNIZ service_role'e açık. anon'a verilseydi kötü niyetli
-- biri PostgREST'ten rastgele anahtarlarla çağırıp başkasının sayacını
-- doldurabilir (meşru kullanıcıyı kilitler) ya da tabloyu şişirebilirdi.
-- Çağrı yalnız sunucu action'larından (lib/qr/hiz-siniri.ts) yapılır.

CREATE TABLE IF NOT EXISTS public.hiz_siniri_sayac (
  anahtar text NOT NULL,
  pencere_baslangic timestamptz NOT NULL,
  sayac integer NOT NULL DEFAULT 0,
  PRIMARY KEY (anahtar, pencere_baslangic)
);

ALTER TABLE public.hiz_siniri_sayac ENABLE ROW LEVEL SECURITY;
-- Policy YOK: client rollerinden hiçbir erişim; yalnız SECURITY DEFINER fonksiyon.
REVOKE ALL ON public.hiz_siniri_sayac FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS hiz_siniri_sayac_pencere_idx
  ON public.hiz_siniri_sayac (pencere_baslangic);

-- p_artir=true  : sayacı 1 artırır ve limit aşılmadıysa true döner.
-- p_artir=false : yalnız okur (artırmaz); mevcut sayaç < limit ise true döner.
CREATE OR REPLACE FUNCTION public.hiz_siniri_kullan(
  p_anahtar text,
  p_limit integer,
  p_pencere_sn integer,
  p_artir boolean DEFAULT true
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pencere timestamptz;
  v_sayac integer;
BEGIN
  IF p_anahtar IS NULL OR length(p_anahtar) > 200 OR p_limit < 1 OR p_pencere_sn < 1 THEN
    RAISE EXCEPTION 'hiz_siniri_parametre_gecersiz';
  END IF;

  v_pencere := to_timestamp(floor(extract(epoch FROM now()) / p_pencere_sn) * p_pencere_sn);

  IF p_artir THEN
    INSERT INTO hiz_siniri_sayac (anahtar, pencere_baslangic, sayac)
    VALUES (p_anahtar, v_pencere, 1)
    ON CONFLICT (anahtar, pencere_baslangic)
    DO UPDATE SET sayac = hiz_siniri_sayac.sayac + 1
    RETURNING sayac INTO v_sayac;

    -- Fırsatçı temizlik (~%1 çağrıda): cron gerektirmeden tablo şişmez.
    IF random() < 0.01 THEN
      DELETE FROM hiz_siniri_sayac WHERE pencere_baslangic < now() - interval '2 days';
    END IF;

    RETURN v_sayac <= p_limit;
  END IF;

  SELECT sayac INTO v_sayac
  FROM hiz_siniri_sayac
  WHERE anahtar = p_anahtar AND pencere_baslangic = v_pencere;

  RETURN COALESCE(v_sayac, 0) < p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.hiz_siniri_kullan(text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiz_siniri_kullan(text, integer, integer, boolean) TO service_role;
