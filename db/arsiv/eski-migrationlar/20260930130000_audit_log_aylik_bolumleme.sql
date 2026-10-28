-- audit_log: aylık RANGE partitioning (created_at, UTC ay sınırları).
--
-- Neden: tablo append-only ve saklama politikası yok; v2 tetikleyicileriyle (finans + hasta)
-- büyüme hızlanıyor. Aylık bölüntü ile (a) tarih filtreli Denetim Geçmişi sorguları yalnız
-- ilgili partition'ları tarar, (b) ileride eski aylar DETACH PARTITION ile anlık ayrılıp
-- soğuk depolamaya aktarılabilir (DELETE ile şişirmeden). Arşive taşıma bu migration'da YOK —
-- yasal saklama süresi hukuk onayı bekliyor.
--
-- Uygulama kodu DEĞİŞMEZ: tetikleyici fonksiyonlar ve action'lar tabloya ada göre
-- (`insert into audit_log`) yazar, yeni tablo aynı adı devralır.
--
-- Değişiklikler:
--  * Eski tablo `audit_log_eski` olarak yeniden adlandırılır, veri yeni bölünmüş tabloya kopyalanır,
--    satır sayısı doğrulanır (uyuşmazsa migration TAMAMEN geri alınır).
--  * PK (id) -> (id, created_at): partition anahtarı PK'de olmak zorunda.
--  * `audit_log_klinik_id` indeksi kaldırıldı: (klinik_id, created_at desc) bileşik indeksi onu kapsıyor.
--  * DEFAULT partition: bölüm oluşturma cron'u aksarsa INSERT hata vermesin (v2 tetikleyicisi
--    hatayı yuttuğu için aksi halde denetim satırı sessizce kaybolurdu).
--  * `audit_log_bolum_olustur()` RPC'si (yalnız service_role) — aylık cron çağırır.
--
-- Eski tablo (`audit_log_eski`) SİLİNMEZ: anon/authenticated erişimi kesilir, doğrulamadan sonra
-- elle `drop table audit_log_eski;` ile kaldırın.
--
-- Uygulama notu: kısa süreli ACCESS EXCLUSIVE kilidi alır; düşük trafikte uygulayın.

begin;

lock table audit_log in access exclusive mode;

-- 1) Eski tabloyu kenara al (ad çakışmasın diye PK ve indeksler de yeniden adlandırılır)
alter table audit_log rename to audit_log_eski;
alter table audit_log_eski rename constraint audit_log_pkey to audit_log_eski_pkey;
alter index if exists idx_audit_log_klinik_id rename to idx_audit_log_eski_klinik_id;
alter index if exists idx_audit_log_klinik_tarih rename to idx_audit_log_eski_klinik_tarih;

-- 2) Bölünmüş yeni tablo (şema birebir aynı, PK'ye created_at eklendi)
create table audit_log (
  id uuid not null default gen_random_uuid(),
  klinik_id uuid references klinik(id) on delete set null,
  kullanici_id uuid references kullanici(id) on delete set null,
  eylem text not null,
  hedef_tablo text,
  hedef_id uuid,
  detay jsonb,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

alter table audit_log enable row level security;

-- Politikalar eski tablodakiyle aynı (20260913140000'daki initplan biçimi)
create policy "audit_log_insert_klinik" on audit_log
  for insert with check (
    klinik_id = (select current_klinik_id()) or (select is_super_admin())
  );

create policy "audit_log_select_admin" on audit_log
  for select using (
    (
      klinik_id = (select current_klinik_id())
      and (select current_rol()) = 'klinik_admin'::kullanici_rol_tipi
    )
    or (select is_super_admin())
  );

-- İndeks partition'lara otomatik yayılır. (klinik_id, created_at desc) Denetim Geçmişi sorgusunun yolu.
create index idx_audit_log_klinik_tarih on audit_log (klinik_id, created_at desc);

create table audit_log_varsayilan partition of audit_log default;

-- GÜVENLİK: partition'lar PostgREST'e ayrı tablo olarak görünür ve üst tablonun RLS'i doğrudan
-- partition sorgusuna UYGULANMAZ (/rest/v1/audit_log_2026_09 başka kliniğin logunu okutabilirdi).
-- Her partition'da RLS açık + policy YOK (= API'den erişim tamamen kapalı) ve anon/authenticated
-- grant'leri kaldırılır. Üst tablo üzerinden okuma/yazma etkilenmez: orada üst tablonun RLS'i geçerli,
-- SECURITY DEFINER tetikleyiciler de üst tabloya yazar.
alter table audit_log_varsayilan enable row level security;
revoke all on table audit_log_varsayilan from anon, authenticated;

-- 3) Bölüm oluşturucu: bu ayın başından p_ileri_ay ay ilerisine kadar eksik aylık partition'ları açar.
--    p_baslangic verilirse o ayın başından başlar (ilk kurulumda eski verinin en eski ayı).
--    Dönüş: oluşturulan partition adları + DEFAULT partition'daki satır sayısı (en çok 1000'e kadar
--    sayılır). 0'dan büyükse bir ay için bölüm zamanında açılmamış demektir: o aralığa bölüm
--    eklenemez önce satırlar taşınmalı (bkz. aşağıdaki not).
create or replace function audit_log_bolum_olustur(
  p_ileri_ay int default 3,
  p_baslangic date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ay date;
  v_son date;
  v_ad text;
  v_olusan text[] := '{}';
  v_varsayilan bigint;
begin
  v_ay := date_trunc('month', coalesce(p_baslangic::timestamp, now() at time zone 'UTC'))::date;
  v_son := date_trunc('month', (now() at time zone 'UTC') + make_interval(months => p_ileri_ay))::date;

  while v_ay <= v_son loop
    v_ad := 'audit_log_' || to_char(v_ay, 'YYYY_MM');
    if to_regclass(format('public.%I', v_ad)) is null then
      execute format(
        'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
        v_ad,
        (v_ay::timestamp at time zone 'UTC'),
        ((v_ay + interval '1 month')::timestamp at time zone 'UTC')
      );
      -- Partition doğrudan API'den erişilemesin (bkz. yukarıdaki güvenlik notu)
      execute format('alter table public.%I enable row level security', v_ad);
      execute format('revoke all on table public.%I from anon, authenticated', v_ad);
      v_olusan := v_olusan || v_ad;
    end if;
    v_ay := (v_ay + interval '1 month')::date;
  end loop;

  select count(*) into v_varsayilan
  from (select 1 from public.audit_log_varsayilan limit 1000) s;

  return jsonb_build_object('olusturulan', to_jsonb(v_olusan), 'varsayilan_satir', v_varsayilan);
end;
$$;

revoke all on function audit_log_bolum_olustur(int, date) from public, anon, authenticated;
grant execute on function audit_log_bolum_olustur(int, date) to service_role;

-- 4) İlk kurulum: eski verinin en eski ayından bugünden 12 ay ilerisine kadar bölüm aç
do $$
declare
  v_ilk timestamptz;
begin
  select min(created_at) into v_ilk from audit_log_eski;
  perform audit_log_bolum_olustur(12, (v_ilk at time zone 'UTC')::date);
end $$;

-- 5) Veriyi kopyala ve doğrula
insert into audit_log (id, klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay, created_at)
select id, klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay, created_at
from audit_log_eski;

do $$
declare
  v_eski bigint;
  v_yeni bigint;
  v_varsayilan bigint;
begin
  select count(*) into v_eski from audit_log_eski;
  select count(*) into v_yeni from audit_log;
  select count(*) into v_varsayilan from audit_log_varsayilan;
  if v_eski <> v_yeni then
    raise exception 'audit_log kopyası uyuşmuyor: eski=% yeni=%', v_eski, v_yeni;
  end if;
  if v_varsayilan <> 0 then
    raise exception 'audit_log satırları DEFAULT partition''a düştü (%): bölüm aralığı eksik', v_varsayilan;
  end if;
end $$;

-- 6) Eski tabloya API erişimini kes (doğrulamadan sonra elle drop edilecek)
revoke all on table audit_log_eski from anon, authenticated;
comment on table audit_log_eski is 'audit_log bölümlemeden önceki kopya (20260930130000). Doğrulandıktan sonra DROP edin.';

analyze audit_log;

commit;

-- Doğrulama (uygulamadan sonra, SQL editöründe):
--   select count(*) from audit_log; select count(*) from audit_log_eski;               -- eşit olmalı
--   select tableoid::regclass, count(*) from audit_log group by 1 order by 1;          -- aylara dağılmış, varsayilan yok
--   select audit_log_bolum_olustur(3);                                                 -- olusturulan: [] (zaten var)
--   select c.relname, c.relrowsecurity from pg_class c join pg_inherits i on i.inhrelid = c.oid
--     where i.inhparent = 'public.audit_log'::regclass;                                -- relrowsecurity hepsinde true olmalı
--   explain select * from audit_log where klinik_id = '...' and created_at >= now() - interval '30 days';
--       -- yalnız ilgili partition'ları taramalı (partition pruning)
--   Uygulamada bir ödeme/hasta kaydı yapıp Denetim Geçmişi'nde göründüğünü doğrulayın.
--
-- DEFAULT partition'a satır düşerse (cron aksadı): o ayın bölümü açılamaz; önce
--   create temp table t as select * from audit_log_varsayilan where created_at >= <ay başı> and created_at < <ay sonu>;
--   delete from audit_log_varsayilan where ...aynı aralık; select audit_log_bolum_olustur(...); insert into audit_log select * from t;
