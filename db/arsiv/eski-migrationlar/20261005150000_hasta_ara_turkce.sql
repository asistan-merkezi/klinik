-- Türkçe uyumlu, yazım hatasına toleranslı hasta arama.
--
-- Önceki arama `ad_soyad ILIKE '%...%'` idi: "sahin" yazınca "Şahin", "ismail"
-- yazınca "İsmail" bulunmuyordu (ILIKE Türkçe harfleri ASCII karşılığına
-- eşlemez), "Mehemt" gibi bir yazım hatası da hiç sonuç vermiyordu.
--
--  * turkce_arama_metni(text): Türkçe harfleri ASCII'ye indirip küçültür
--    (Ç→c, Ğ→g, İ/I/ı→i, Ö→o, Ş→s, Ü→u, şapkalılar dahil). `unaccent` eklentisi
--    yerine translate() — IMMUTABLE olduğundan ifade indeksinde kullanılabilir,
--    ek eklenti gerekmez ve İ/ı'yı doğru eşler (unaccent "ı"yı dönüştürmez).
--  * İfade üzerine trigram GIN indeksi (kolon EKLENMEDİ: hasta tablosu denetim
--    tetikleyicisine bağlı; üretilmiş bir kolon her ad değişikliğinde Denetim
--    Geçmişi'nde gereksiz bir alan olarak görünürdü).
--  * hasta_ara(p_sorgu, p_limit): SETOF hasta döner → PostgREST'te
--    `.rpc('hasta_ara', …).select('id, …, hasta_hassas(adres)')` embed'i çalışır.
--    Eşleşme: ad alt dizesi (Türkçe duyarsız) VEYA kelime benzerliği ≥ 0.4
--    (yazım hatası) VEYA telefon rakamları. Sıralama: baştan eşleşen > içinde
--    geçen > benzerlik > ad.
--    SECURITY INVOKER: hasta RLS'i aynen geçerli (klinik izolasyonu, terapist kapsamı).
--
-- Uygulama tarafı (lib/hasta/arama.ts > hastaAra) RPC yoksa eski ILIKE aramasına düşer.

create extension if not exists pg_trgm;

create or replace function public.turkce_arama_metni(p text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(translate(coalesce(p, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu'));
$$;

-- pg_trgm Supabase'de `extensions` ya da `public` şemasında olabilir; opclass'ı
-- şema belirtmeden kullanabilmek için arama yolunu geçici genişletiyoruz.
set search_path = public, extensions;

create index if not exists idx_hasta_ad_arama_trgm
  on public.hasta using gin (public.turkce_arama_metni(ad_soyad) gin_trgm_ops);

reset search_path;

create or replace function public.hasta_ara(p_sorgu text, p_limit integer default 8)
returns setof public.hasta
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      -- LIKE joker karakterleri arama metninden çıkarılır
      trim(regexp_replace(turkce_arama_metni(p_sorgu), '[%_\\]', ' ', 'g')) as metin,
      regexp_replace(coalesce(p_sorgu, ''), '\D', '', 'g') as rakam
  ),
  q2 as (
    select
      metin,
      -- "0532 123 45 67" / "+90 532..." → "5321234567" (lib/utils.ts > telefonYerelHaneleriCikar ile aynı)
      left(ltrim(case when length(rakam) > 10 and left(rakam, 2) = '90' then substr(rakam, 3) else rakam end, '0'), 10) as tel
    from q
  )
  select h.*
  from hasta h, q2
  where length(q2.metin) > 0
    and (
      turkce_arama_metni(h.ad_soyad) like '%' || q2.metin || '%'
      or (length(q2.metin) >= 3 and word_similarity(q2.metin, turkce_arama_metni(h.ad_soyad)) >= 0.4)
      or (length(q2.tel) >= 3 and h.telefon like '%' || q2.tel || '%')
    )
  order by
    (turkce_arama_metni(h.ad_soyad) like q2.metin || '%') desc,
    (turkce_arama_metni(h.ad_soyad) like '%' || q2.metin || '%') desc,
    word_similarity(q2.metin, turkce_arama_metni(h.ad_soyad)) desc,
    h.ad_soyad
  limit least(greatest(coalesce(p_limit, 8), 1), 100);
$$;

revoke all on function public.hasta_ara(text, integer) from public, anon;
grant execute on function public.hasta_ara(text, integer) to authenticated;

-- Doğrulama:
-- select turkce_arama_metni('Şahin İSMAİL Çağrı Ilgın');           -- 'sahin ismail cagri ilgin'
-- select ad_soyad from hasta_ara('sahin', 10);                       -- Şahin'ler gelmeli
-- select ad_soyad from hasta_ara('mehemt', 10);                      -- Mehmet'ler gelmeli
-- select ad_soyad from hasta_ara('0532 123 45 67', 10);              -- telefonla eşleşme
-- explain select * from hasta where turkce_arama_metni(ad_soyad) like '%sah%';  -- idx_hasta_ad_arama_trgm
