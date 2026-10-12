-- Hastalar listesi: ada göre harf çubuğu + sayfalama.
--
-- Önceden arama yapılmadan yalnız alfabetik ilk 50 hasta görünüyordu (sonrasına liste üzerinden
-- ulaşılamıyordu). Liste artık seçilen BAŞ HARFE göre süzülür ve 50'lik sayfalarla gezilir.
--
-- Sıralama veritabanının dil (collation) ayarına GÜVENMEZ: Türkçe alfabe sırası açıkça kodlanır.
-- Aksi halde (ör. C/en_US collation) "Çelik" Z'den sonraya ya da C'lerin arasına düşer, "İ" ile "I"
-- karışır. Harf eşlemesi de lower()'ın locale'ine bağlı değil (I→ı, İ→i açıkça çevrilir).
-- SECURITY INVOKER: hasta RLS'i aynen geçerli (klinik izolasyonu, terapist kapsamı).

-- Türkçe küçük harf (locale'den bağımsız). Şapkalı harfler düz karşılığına indirgenir.
create or replace function public.turkce_kucuk_harf(p text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    coalesce(p, ''),
    'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZÂÎÛâîû',
    'abcçdefgğhıijklmnoöpqrsştuüvwxyzaiuaiu'
  );
$$;

-- Türkçe alfabe sırasını koruyan sıralama anahtarı ("C" collation ile sıralanır):
-- a b c ç d e f g ğ h ı i j k l m n o ö p q r s ş t u ü v w x y z → A..Z, a..f (artan ASCII).
-- Boşluk (0x20) harflerden önce gelir: "Ali Veli" < "Alican".
create or replace function public.turkce_sira_anahtari(p text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    public.turkce_kucuk_harf(btrim(p)),
    'abcçdefgğhıijklmnoöpqrsştuüvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'
  );
$$;

-- Baş harf → hasta sayısı (harf çubuğundaki sayılar). harf: Türkçe küçük harf ya da başka karakter.
create or replace function public.hasta_bas_harf_sayilari()
returns table (harf text, adet bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) as harf, count(*) as adet
  from hasta h
  group by 1;
$$;

-- Seçilen baş harfin (p_harf: Türkçe küçük harf; 'diger' = alfabe dışı; NULL = tümü) hastaları,
-- Türkçe alfabe sırasıyla, [p_bas, p_bas + p_adet) aralığında. SETOF hasta → PostgREST embed çalışır.
create or replace function public.hasta_harf_listesi(p_harf text, p_bas integer default 0, p_adet integer default 50)
returns setof public.hasta
language sql
stable
security invoker
set search_path = public
as $$
  select h.*
  from hasta h
  where p_harf is null
     or (p_harf = 'diger'
         and position(left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) in 'abcçdefgğhıijklmnoöprsştuüvyz') = 0)
     or (p_harf <> 'diger' and left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) = p_harf)
  order by turkce_sira_anahtari(h.ad_soyad) collate "C", h.id
  offset greatest(coalesce(p_bas, 0), 0)
  limit least(greatest(coalesce(p_adet, 50), 1), 200);
$$;

revoke all on function public.hasta_bas_harf_sayilari() from public, anon;
revoke all on function public.hasta_harf_listesi(text, integer, integer) from public, anon;
grant execute on function public.hasta_bas_harf_sayilari() to authenticated;
grant execute on function public.hasta_harf_listesi(text, integer, integer) to authenticated;

-- Doğrulama:
--   select turkce_sira_anahtari('Çelik') > turkce_sira_anahtari('Cem') collate "C";        -- true
--   select turkce_sira_anahtari('Çelik') < turkce_sira_anahtari('Deniz') collate "C";      -- true
--   select left(turkce_kucuk_harf('İsmail'),1), left(turkce_kucuk_harf('Irmak'),1);        -- i | ı
