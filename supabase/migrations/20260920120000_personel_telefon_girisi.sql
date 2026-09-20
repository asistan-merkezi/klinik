-- Kullanıcı kararı: panel girişi artık role göre ikiye ayrılıyor — klinik_admin
-- (ve super_admin) e-posta+şifre ile, diğer TÜM roller (terapist/resepsiyon/
-- muhasebe) telefon+şifre ile giriyor. Hasta Portalı'ndaki
-- 'telefon -> sentetik e-posta' RPC deseniyle (portal_giris_epostasi) aynı
-- yaklaşım, tek fark: burada e-posta sentetik değil, gerçek auth.users.email
-- (kurumsal e-posta) — normal signInWithPassword akışı bu e-postayla devam
-- ediyor, sadece giriş EKRANINDA kullanıcı telefon giriyor.
--
-- Normalize: mevcut kullanici.telefon verisi karışık formatta ("+905367647383"
-- vs "05000000005") — ham string eşleşmesi (portal'daki gibi) burada personeli
-- kilitler. telefon_normalize() son 10 haneyi alıp başında 0/+90 farkını yutar.

CREATE OR REPLACE FUNCTION public.telefon_normalize(p_telefon text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT NULLIF(right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 10), '');
$function$;

-- Aynı normalize edilmiş numarayla iki kullanici olamaz (klinikler arası dahil —
-- girişteki RPC henüz hangi klinikte olduğumuzu bilmiyor, tekillik global olmalı).
CREATE UNIQUE INDEX IF NOT EXISTS idx_kullanici_telefon_normalize
  ON kullanici (telefon_normalize(telefon))
  WHERE telefon_normalize(telefon) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.personel_giris_epostasi(p_telefon text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.email
  FROM kullanici k
  JOIN auth.users u ON u.id = k.id
  WHERE k.rol NOT IN ('klinik_admin', 'super_admin')
    AND telefon_normalize(k.telefon) = telefon_normalize(p_telefon)
    AND telefon_normalize(p_telefon) IS NOT NULL
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.personel_giris_epostasi(text) TO anon, authenticated;
