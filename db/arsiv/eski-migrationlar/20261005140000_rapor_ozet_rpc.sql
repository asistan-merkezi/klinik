-- Raporlar: dönem toplamlarını satır satır istemciye çekmek yerine Postgres'te topla.
--
-- Önceden (lib/raporlar/hesaplamalar.ts) her dönem için hasta_bakiye_hareket /
-- klinik_harcama / kamusal_odeme / randevu satırlarının TAMAMI sayfalı çekilip
-- JS'te toplanıyordu — doğru ama veri yıllar içinde büyüdükçe Raporlar sayfası
-- yavaşlar. Bu iki fonksiyon aynı kuralları SQL'de uygular:
--
--   rapor_donem_ozeti(p_baslangic, p_bitis, p_baslangic_tarih, p_bitis_tarih)
--     → jsonb: gelir kırılımı + 4 gider kalemi + randevu durum sayıları
--   rapor_yillik_ozet(p_yil)
--     → 12 satır: ay, gelir (net tahsilat), gider, tamamlanan seans
--
-- Kurallar JS ile BİREBİR aynı (biri değişirse diğeri de değişmeli; uygulama
-- RPC yoksa JS yoluna düşer, bkz. hesaplamalar.ts > hesaplaDonemOzeti):
--   * Gelir = hasta_bakiye_hareket tur='odeme' (yönteme göre) − tur='iade'; created_at [baslangic, bitis)
--   * İşletme gideri = klinik_harcama kategori<>'diger' AND is_faturali=false
--   * Diğer gider    = klinik_harcama kategori='diger' AND is_faturali=false
--   * Faturalı gider = klinik_harcama is_faturali=true
--   * Muhasebe gideri = kamusal_odeme odeme_tarihi dolu ve dönem içinde
--   * Randevu: tamamlanan (geldi/gecikmeli_geldi/tamamlandi), planlanan, ertelenen, iptal+gelmedi
--   * Yıllık ay sınırları İstanbul takvimine göre (timestamptz kolonlar için)
--
-- SECURITY INVOKER: çağıranın RLS'i aynen geçerli (önceki istemci sorgularıyla aynı
-- görünürlük); ayrıca klinik_id = current_klinik_id() açıkça süzülür.

-- Toplamların dönem aralığında indeksle taranması için (yalnız eksikse açılır;
-- klinik_harcama'nınki 20261005090000'da da var, IF NOT EXISTS ile çakışmaz).
create index if not exists idx_randevu_klinik_baslangic on randevu (klinik_id, baslangic);
create index if not exists idx_klinik_harcama_klinik_tarih on klinik_harcama (klinik_id, tarih);
create index if not exists idx_kamusal_odeme_klinik_odeme_tarihi on kamusal_odeme (klinik_id, odeme_tarihi)
  where odeme_tarihi is not null;

create or replace function public.rapor_donem_ozeti(
  p_baslangic timestamptz,
  p_bitis timestamptz,
  p_baslangic_tarih date,
  p_bitis_tarih date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with k as (select current_klinik_id() as id),
  tahsilat as (
    select
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'nakit'), 0) as nakit,
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti'), 0) as kredi_karti,
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'banka_havalesi'), 0) as banka_havalesi,
      coalesce(sum(h.tutar) filter (
        where h.tur = 'odeme' and (h.odeme_yontemi is null or h.odeme_yontemi not in ('nakit', 'kredi_karti', 'banka_havalesi'))
      ), 0) as belirtilmemis,
      coalesce(sum(h.tutar) filter (where h.tur = 'iade'), 0) as iade
    from hasta_bakiye_hareket h, k
    where h.klinik_id = k.id
      and h.tur in ('odeme', 'iade')
      and h.created_at >= p_baslangic and h.created_at < p_bitis
  ),
  harcama as (
    select
      coalesce(sum(g.tutar) filter (where g.kategori <> 'diger' and g.is_faturali = false), 0) as isletme,
      coalesce(sum(g.tutar) filter (where g.kategori = 'diger' and g.is_faturali = false), 0) as diger,
      coalesce(sum(g.tutar) filter (where g.is_faturali = true), 0) as faturali
    from klinik_harcama g, k
    where g.klinik_id = k.id
      and g.tarih >= p_baslangic_tarih and g.tarih < p_bitis_tarih
  ),
  kamusal as (
    select coalesce(sum(o.tutar), 0) as muhasebe
    from kamusal_odeme o, k
    where o.klinik_id = k.id
      and o.odeme_tarihi is not null
      and o.odeme_tarihi >= p_baslangic_tarih and o.odeme_tarihi < p_bitis_tarih
  ),
  randevu_ozet as (
    select
      count(*) filter (where r.durum in ('geldi', 'gecikmeli_geldi', 'tamamlandi')) as tamamlanan,
      count(*) filter (where r.durum = 'planlandi') as planlanan,
      count(*) filter (where r.durum = 'ertelendi') as ertelenen,
      count(*) filter (where r.durum in ('iptal', 'gelmedi')) as iptal_ve_gelmedi,
      count(*) as toplam
    from randevu r, k
    where r.klinik_id = k.id
      and r.baslangic >= p_baslangic and r.baslangic < p_bitis
  )
  select jsonb_build_object(
    'gelir', jsonb_build_object(
      'nakit', t.nakit,
      'kredi_karti', t.kredi_karti,
      'banka_havalesi', t.banka_havalesi,
      'belirtilmemis', t.belirtilmemis,
      'iade', t.iade
    ),
    'isletme_gideri', g.isletme,
    'diger_giderler', g.diger,
    'faturali_giderler', g.faturali,
    'muhasebe_gideri', m.muhasebe,
    'randevu', jsonb_build_object(
      'tamamlanan', r.tamamlanan,
      'planlanan', r.planlanan,
      'ertelenen', r.ertelenen,
      'iptal_ve_gelmedi', r.iptal_ve_gelmedi,
      'toplam', r.toplam
    )
  )
  from tahsilat t, harcama g, kamusal m, randevu_ozet r;
$$;

create or replace function public.rapor_yillik_ozet(p_yil integer)
returns table (ay integer, gelir numeric, gider numeric, seans_sayisi integer)
language sql
stable
security invoker
set search_path = public
as $$
  with k as (select current_klinik_id() as id),
  aylar as (select generate_series(1, 12) as ay),
  -- İstanbul takvim yılının sınırları (timestamptz kolonlar için)
  sinir as (
    select
      (make_date(p_yil, 1, 1)::timestamp at time zone 'Europe/Istanbul') as bas_ts,
      (make_date(p_yil + 1, 1, 1)::timestamp at time zone 'Europe/Istanbul') as bit_ts,
      make_date(p_yil, 1, 1) as bas_t,
      make_date(p_yil + 1, 1, 1) as bit_t
  ),
  tahsilat as (
    select extract(month from (h.created_at at time zone 'Europe/Istanbul'))::int as ay,
           sum(case when h.tur = 'iade' then -h.tutar else h.tutar end) as tutar
    from hasta_bakiye_hareket h, k, sinir s
    where h.klinik_id = k.id and h.tur in ('odeme', 'iade')
      and h.created_at >= s.bas_ts and h.created_at < s.bit_ts
    group by 1
  ),
  gider as (
    select ay, sum(tutar) as tutar from (
      select extract(month from g.tarih)::int as ay, g.tutar
      from klinik_harcama g, k, sinir s
      where g.klinik_id = k.id and g.tarih >= s.bas_t and g.tarih < s.bit_t
      union all
      select extract(month from o.odeme_tarihi)::int, o.tutar
      from kamusal_odeme o, k, sinir s
      where o.klinik_id = k.id and o.odeme_tarihi is not null
        and o.odeme_tarihi >= s.bas_t and o.odeme_tarihi < s.bit_t
    ) x
    group by ay
  ),
  seans as (
    select extract(month from (r.baslangic at time zone 'Europe/Istanbul'))::int as ay, count(*)::int as sayi
    from randevu r, k, sinir s
    where r.klinik_id = k.id and r.durum in ('geldi', 'gecikmeli_geldi', 'tamamlandi')
      and r.baslangic >= s.bas_ts and r.baslangic < s.bit_ts
    group by 1
  )
  select a.ay,
         coalesce(t.tutar, 0)::numeric,
         coalesce(g.tutar, 0)::numeric,
         coalesce(se.sayi, 0)
  from aylar a
  left join tahsilat t on t.ay = a.ay
  left join gider g on g.ay = a.ay
  left join seans se on se.ay = a.ay
  order by a.ay;
$$;

revoke all on function public.rapor_donem_ozeti(timestamptz, timestamptz, date, date) from public, anon;
revoke all on function public.rapor_yillik_ozet(integer) from public, anon;
grant execute on function public.rapor_donem_ozeti(timestamptz, timestamptz, date, date) to authenticated;
grant execute on function public.rapor_yillik_ozet(integer) to authenticated;

-- Doğrulama (uygulama sonrası, klinik_admin oturumuyla ya da psql simülasyonuyla):
-- select rapor_donem_ozeti('2026-09-30 21:00+00', '2026-10-31 21:00+00', '2026-10-01', '2026-11-01');
-- select * from rapor_yillik_ozet(2026);
-- Sonuçlar Raporlar sayfasının eski (JS) hesaplarıyla aynı olmalı.
