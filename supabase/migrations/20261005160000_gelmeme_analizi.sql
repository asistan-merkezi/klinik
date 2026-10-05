-- Gelmeme (no-show) analizi: seçili dönemde geçmiş randevuların sonuç dağılımı,
-- terapist / saat / haftanın günü / ay / hasta kırılımında. Yönetim > Gelmeme
-- Analizi sayfası (app/(app)/panel/yonetim/gelmeme-analizi) tek çağrıyla okur.
--
-- Tanımlar (sayfadaki açıklamayla AYNI):
--   gerceklesen    = geldi, gecikmeli_geldi, seansta, tamamlandi
--   gelmedi        = gelmedi
--   gecikmeli      = gecikmeli_geldi (gerceklesen'in alt kümesi, ayrıca gösterilir)
--   iptal, ertelendi
--   isaretlenmemis = saati geçmiş ama hâlâ 'planlandi' (resepsiyon sonucu girmemiş)
--   Gelmeme oranı (uygulamada) = gelmedi / (gerceklesen + gelmedi)
-- Yalnız başlangıcı ŞU ANDAN önceki randevular sayılır (gelecek randevu "gelmedi" olamaz).
-- Saat/gün/ay İstanbul takvimine göre.
--
-- boyut: 'toplam' | 'terapist' | 'saat' (0-23) | 'gun' (ISO 1=Pzt..7=Paz) | 'ay' (yyyy-MM) | 'hasta'
-- 'hasta' kırılımı yalnız en az 2 kez gelmeyen ilk 10 hastayı döner (tekrarlayan gelmeme takibi).
--
-- SECURITY INVOKER (randevu RLS'i aynen geçerli) + yalnız klinik_admin / super_admin:
-- terapist bazlı oranlar personel performans verisidir.

create or replace function public.gelmeme_analizi(p_baslangic timestamptz, p_bitis timestamptz)
returns table (
  boyut text,
  anahtar text,
  etiket text,
  gerceklesen integer,
  gelmedi integer,
  gecikmeli integer,
  iptal integer,
  ertelendi integer,
  isaretlenmemis integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (current_rol() = 'klinik_admin' or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  return query
  with r as (
    select
      ra.id,
      ra.durum::text as durum,
      ra.terapist_id,
      ra.hasta_id,
      (ra.baslangic at time zone 'Europe/Istanbul') as yerel
    from randevu ra
    where ra.klinik_id = current_klinik_id()
      and ra.baslangic >= p_baslangic
      and ra.baslangic < least(p_bitis, now())
  ),
  s as (
    select
      r.*,
      (r.durum in ('geldi', 'gecikmeli_geldi', 'seansta', 'tamamlandi'))::int as g_gerceklesen,
      (r.durum = 'gelmedi')::int as g_gelmedi,
      (r.durum = 'gecikmeli_geldi')::int as g_gecikmeli,
      (r.durum = 'iptal')::int as g_iptal,
      (r.durum = 'ertelendi')::int as g_ertelendi,
      (r.durum = 'planlandi')::int as g_isaretlenmemis
    from r
  ),
  kirilim as (
    select 'toplam'::text as boyut, 'toplam'::text as anahtar, 'Toplam'::text as etiket,
           sum(g_gerceklesen) as a, sum(g_gelmedi) as b, sum(g_gecikmeli) as c,
           sum(g_iptal) as d, sum(g_ertelendi) as e, sum(g_isaretlenmemis) as f
    from s
    union all
    select 'terapist', coalesce(s.terapist_id::text, '-'), coalesce(max(p.ad_soyad), 'Terapist atanmamış'),
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s
    left join terapist t on t.id = s.terapist_id
    left join personel p on p.id = t.personel_id
    group by s.terapist_id
    union all
    select 'saat', lpad(extract(hour from yerel)::int::text, 2, '0'), lpad(extract(hour from yerel)::int::text, 2, '0') || ':00',
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by extract(hour from yerel)
    union all
    select 'gun', extract(isodow from yerel)::int::text, extract(isodow from yerel)::int::text,
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by extract(isodow from yerel)
    union all
    select 'ay', to_char(yerel, 'YYYY-MM'), to_char(yerel, 'YYYY-MM'),
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by to_char(yerel, 'YYYY-MM')
    union all
    select * from (
      select 'hasta'::text, s.hasta_id::text, coalesce(max(h.ad_soyad), 'Hasta'),
             sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
      from s
      join hasta h on h.id = s.hasta_id
      group by s.hasta_id
      having sum(g_gelmedi) >= 2
      order by sum(g_gelmedi) desc, coalesce(max(h.ad_soyad), 'Hasta')
      limit 10
    ) tekrar
  )
  select k.boyut, k.anahtar, k.etiket,
         coalesce(k.a, 0)::int, coalesce(k.b, 0)::int, coalesce(k.c, 0)::int,
         coalesce(k.d, 0)::int, coalesce(k.e, 0)::int, coalesce(k.f, 0)::int
  from kirilim k;
end;
$$;

revoke all on function public.gelmeme_analizi(timestamptz, timestamptz) from public, anon;
grant execute on function public.gelmeme_analizi(timestamptz, timestamptz) to authenticated;

-- Doğrulama (klinik_admin oturumuyla):
-- select * from gelmeme_analizi(now() - interval '90 days', now()) where boyut = 'toplam';
-- Toplam satırındaki sayıların toplamı, aynı aralıkta baslangic < now() olan randevu sayısına eşit olmalı.
