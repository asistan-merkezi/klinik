-- Tek oturum kilidi: aynı kullanıcı+şifreyle aynı anda yalnız 1 cihaz/tarayıcı
-- açık kalsın (admin dahil). Supabase'in native "Single session per user"
-- ayarı Pro plan+ gerektiriyor ve panelden açılıyor, koddan değil — bu yüzden
-- kendi mekanizmamız: girişte bu tabloya rastgele bir anahtar yazılır ve
-- tarayıcıya aynı anahtar cookie olarak konur (bkz. lib/auth/oturum-kilidi.ts).
-- Sonraki her panel/portal sayfa yüklemesinde ikisi karşılaştırılır; başka bir
-- yerden yeniden giriş yapılınca satır güncellenir ve eski tarayıcının
-- anahtarı artık eşleşmediği için o oturum zorla kapatılır.
--
-- Kapsam: kullanici_id, auth.users(id) — hem personel/admin girişi (kullanici
-- tablosu) hem hasta portalı girişi (hasta_kullanici) aynı auth.users satırını
-- paylaştığı için TEK tabloyla ikisi de kapsanır.
--
-- NOT: Bu migration KASITLI olarak bu turda canlı Supabase'e UYGULANMADI —
-- Vodafone cloud sunucuya geçişte uygulanacak (kullanıcı kararı, 2026-09-27).
-- Bu yüzden lib/auth/oturum-kilidi.ts'teki her sorgu "tablo/RPC yok" hatasını
-- sessizce yutup fail-open davranır (bkz. o dosyanın başındaki not) — aksi
-- halde migration uygulanmadan bu kod deploy edilirse TÜM girişler kırılırdı.

CREATE TABLE public.oturum_kilidi (
  kullanici_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  oturum_anahtari uuid NOT NULL DEFAULT gen_random_uuid(),
  guncelleme_zamani timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oturum_kilidi ENABLE ROW LEVEL SECURITY;

-- Yalnız kendi satırını okuyabilir (tarayıcıdaki cookie'yle karşılaştırmak için).
-- INSERT/UPDATE/DELETE için hiç policy yok — yazma yalnız aşağıdaki
-- SECURITY DEFINER RPC üzerinden.
CREATE POLICY oturum_kilidi_kendi_select ON public.oturum_kilidi
  FOR SELECT
  USING (auth.uid() = kullanici_id);

CREATE OR REPLACE FUNCTION public.oturum_anahtari_yenile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_anahtar uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO oturum_kilidi (kullanici_id, oturum_anahtari, guncelleme_zamani)
  VALUES (auth.uid(), v_anahtar, now())
  ON CONFLICT (kullanici_id) DO UPDATE
    SET oturum_anahtari = EXCLUDED.oturum_anahtari,
        guncelleme_zamani = now();

  RETURN v_anahtar;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.oturum_anahtari_yenile() TO authenticated;
