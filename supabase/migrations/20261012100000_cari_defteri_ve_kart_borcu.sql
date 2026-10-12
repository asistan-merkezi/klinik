-- Tedarikçi CARİ DEFTERİ + şirket KREDİ KARTI BORCU (2026-10-12; Villavilla "Cari Takibi + Kredi Kartı
-- Takibi" rehberinin klinik uyarlaması). İdempotent; mevcut veriye dokunmaz.
--
-- CARİ (tedarikçi bazında, ayrı tedarikçi tablosu YOK — klinik_harcama.tedarikci_adi'ndan gruplanır):
--   Borç   = klinik_harcama.odeme_tipi='cari' ("Cariye Ekle", henüz ödenmedi)
--          + ödenmiş giderler (nakit/havale/kredi_karti, tedarikçi adlı) — hem Borç hem Ödenen, net 0
--   Ödenen = klinik_cari_odeme (cari ödemeleri) + ödenmiş giderler (yukarıdaki gibi)
--   Bakiye = Borç − Ödenen (pozitif = tedarikçiye borcumuz var).
--   Ödeme yöntemi boş ("Ödeme bilgisi bekliyor") giderler hiçbir toplama girmez.
--   Tedarikçi eşleme anahtarı: tedarikci_anahtari() — uygulamadaki Türkçe-küçük-harf/tek-boşluk
--   kuralıyla AYNI (JS: toLocaleLowerCase("tr-TR"); biri değişirse diğeri de değişmeli).
-- KASA/BANKA: nakit/havale cari ödemesi ve kart ödemesi ÇIKIŞ olur (3 *_bakiye_once_toplam RPC'si
--   güncellendi; sayfalar da aynı kaynakları okur). RAPORLAR'da cari ödemesi/kart ödemesi GİDER SAYILMAZ
--   (gider zaten klinik_harcama'da, kayıt anında sayıldı) — rapor RPC'lerine dokunulmadı.
-- KREDİ KARTI BORCU: kart harcaması = ödeme tipi kredi_karti olan gider + kartla yapılan cari ödemesi;
--   kart ödemesi = Kasa/Banka'dan karta yapılan ödeme. Kart borcu = harcama − ödeme.

-- ---------------------------------------------------------------- klinik_harcama
alter table klinik_harcama
  add column if not exists kredi_karti_id uuid references klinik_kredi_kartlari(id) on delete set null;

-- odeme_tipi CHECK'ine 'cari' ekle (kolon-seviyesi kısıt adı bilinmediğinden tanımına göre bul).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'klinik_harcama'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%odeme_tipi%' and pg_get_constraintdef(oid) ilike '%kredi_karti%'
  loop
    execute format('alter table klinik_harcama drop constraint %I', c);
  end loop;
end $$;

alter table klinik_harcama drop constraint if exists klinik_harcama_odeme_tipi_check;
alter table klinik_harcama add constraint klinik_harcama_odeme_tipi_check
  check (odeme_tipi in ('nakit', 'havale', 'kredi_karti', 'cari'));

-- "Cariye Ekle" tedarikçisiz olamaz (cari tedarikçi bazında tutulur).
alter table klinik_harcama drop constraint if exists klinik_harcama_cari_tedarikci_check;
alter table klinik_harcama add constraint klinik_harcama_cari_tedarikci_check
  check (odeme_tipi is distinct from 'cari' or (tedarikci_adi is not null and btrim(tedarikci_adi) <> ''));

-- ---------------------------------------------------------------- Tedarikçi eşleme anahtarı
create or replace function tedarikci_anahtari(p_ad text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(btrim(regexp_replace(coalesce(p_ad, ''), '\s+', ' ', 'g')), 'İI', 'iı'))
$$;

create index if not exists idx_klinik_harcama_tedarikci
  on klinik_harcama (klinik_id, tedarikci_anahtari(tedarikci_adi)) where tedarikci_adi is not null;
create index if not exists idx_klinik_harcama_kredi_karti
  on klinik_harcama (kredi_karti_id) where kredi_karti_id is not null;

-- ---------------------------------------------------------------- klinik_cari_odeme
create table if not exists klinik_cari_odeme (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  tedarikci_adi text not null check (btrim(tedarikci_adi) <> ''),
  tutar numeric(12, 2) not null check (tutar > 0),
  tarih date not null,
  odeme_tipi text not null check (odeme_tipi in ('nakit', 'havale', 'kredi_karti')),
  banka_hesap_id uuid references klinik_banka_hesaplari(id) on delete set null,
  kredi_karti_id uuid references klinik_kredi_kartlari(id) on delete set null,
  aciklama text,
  olusturan_kullanici_id uuid references kullanici(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table klinik_cari_odeme enable row level security;

create index if not exists idx_klinik_cari_odeme_klinik_tarih on klinik_cari_odeme (klinik_id, tarih);
create index if not exists idx_klinik_cari_odeme_tedarikci
  on klinik_cari_odeme (klinik_id, tedarikci_anahtari(tedarikci_adi));
create index if not exists idx_klinik_cari_odeme_kredi_karti
  on klinik_cari_odeme (kredi_karti_id) where kredi_karti_id is not null;

-- klinik_harcama ile aynı RLS: görme klinik_admin + muhasebe, yönetme yalnız klinik_admin.
-- Yazma ayrıca klinik_cari_odeme_ekle RPC'sinden (bakiye aşım kontrolü orada); silme doğrudan.
drop policy if exists "klinik_cari_odeme_select" on klinik_cari_odeme;
create policy "klinik_cari_odeme_select" on klinik_cari_odeme
  for select using (
    (klinik_id = current_klinik_id() and current_rol() in ('klinik_admin', 'muhasebe'))
    or is_super_admin()
  );

drop policy if exists "klinik_cari_odeme_yonet_admin" on klinik_cari_odeme;
create policy "klinik_cari_odeme_yonet_admin" on klinik_cari_odeme
  for all using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

drop trigger if exists trg_klinik_cari_odeme_denetim on klinik_cari_odeme;
create trigger trg_klinik_cari_odeme_denetim
  after insert or update or delete on klinik_cari_odeme
  for each row execute function audit_log_degisiklik_yaz();

-- ---------------------------------------------------------------- klinik_kredi_karti_odeme
-- Karta yapılan ödeme (Kasa'dan nakit / Banka'dan havale). Kart FK'sı bilinçli NO ACTION (RESTRICT
-- DEĞİL): kartı ödemesi varken doğrudan silmek statement sonunda hata verir ama klinik silinirken
-- CASCADE (kart + ödeme birlikte) sorunsuz çalışır; RESTRICT anında kontrol edip kaskadı bozardı.
create table if not exists klinik_kredi_karti_odeme (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  kredi_karti_id uuid not null references klinik_kredi_kartlari(id),
  tutar numeric(12, 2) not null check (tutar > 0),
  tarih date not null,
  odeme_tipi text not null check (odeme_tipi in ('nakit', 'havale')),
  banka_hesap_id uuid references klinik_banka_hesaplari(id) on delete set null,
  aciklama text,
  olusturan_kullanici_id uuid references kullanici(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table klinik_kredi_karti_odeme enable row level security;

create index if not exists idx_klinik_kredi_karti_odeme_klinik_tarih on klinik_kredi_karti_odeme (klinik_id, tarih);
create index if not exists idx_klinik_kredi_karti_odeme_kart on klinik_kredi_karti_odeme (kredi_karti_id);

drop policy if exists "klinik_kredi_karti_odeme_select" on klinik_kredi_karti_odeme;
create policy "klinik_kredi_karti_odeme_select" on klinik_kredi_karti_odeme
  for select using (
    (klinik_id = current_klinik_id() and current_rol() in ('klinik_admin', 'muhasebe'))
    or is_super_admin()
  );

drop policy if exists "klinik_kredi_karti_odeme_yonet_admin" on klinik_kredi_karti_odeme;
create policy "klinik_kredi_karti_odeme_yonet_admin" on klinik_kredi_karti_odeme
  for all using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

drop trigger if exists trg_klinik_kredi_karti_odeme_denetim on klinik_kredi_karti_odeme;
create trigger trg_klinik_kredi_karti_odeme_denetim
  after insert or update or delete on klinik_kredi_karti_odeme
  for each row execute function audit_log_degisiklik_yaz();

-- ---------------------------------------------------------------- Cari bakiye (SQL'de hesap)
-- SECURITY INVOKER: RLS çağıranın rolüne göre uygulanır (admin + muhasebe); klinik filtresi ayrıca açık.
create or replace function klinik_cari_bakiyeler(p_klinik_id uuid, p_anahtar text default null)
returns table (anahtar text, borc numeric, odenen numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select k.anahtar, sum(k.borc)::numeric, sum(k.odenen)::numeric
    from (
      -- "Cariye Ekle": yalnız borç
      select tedarikci_anahtari(h.tedarikci_adi) as anahtar, h.tutar::numeric as borc, 0::numeric as odenen
        from klinik_harcama h
       where h.klinik_id = p_klinik_id and h.odeme_tipi = 'cari'
      union all
      -- Ödenmiş gider: borç ve ödenen birlikte (bakiyeyi etkilemez, ekstrede görünür)
      select tedarikci_anahtari(h.tedarikci_adi), h.tutar::numeric, h.tutar::numeric
        from klinik_harcama h
       where h.klinik_id = p_klinik_id and h.odeme_tipi in ('nakit', 'havale', 'kredi_karti')
      union all
      select tedarikci_anahtari(o.tedarikci_adi), 0::numeric, o.tutar::numeric
        from klinik_cari_odeme o
       where o.klinik_id = p_klinik_id
    ) k
   where k.anahtar <> '' and (p_anahtar is null or k.anahtar = p_anahtar)
   group by k.anahtar
$$;

-- ---------------------------------------------------------------- Cari ödemesi (bakiyeyi aşamaz)
-- Okuyup-yazma yarışı (iki eşzamanlı ödeme bakiyeyi birlikte aşabilir) tedarikçi bazlı advisory lock'la kapatılır.
create or replace function klinik_cari_odeme_ekle(
  p_tedarikci_adi text,
  p_tutar numeric,
  p_tarih date,
  p_odeme_tipi text,
  p_banka_hesap_id uuid default null,
  p_kredi_karti_id uuid default null,
  p_aciklama text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_klinik uuid := current_klinik_id();
  v_anahtar text := tedarikci_anahtari(p_tedarikci_adi);
  v_borc numeric := 0;
  v_odenen numeric := 0;
  v_id uuid;
begin
  if v_klinik is null or current_rol() is distinct from 'klinik_admin' then
    raise exception 'yetkisiz';
  end if;
  if v_anahtar = '' then
    raise exception 'tedarikci_gerekli';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'tutar_gecersiz';
  end if;
  if p_tarih is null then
    raise exception 'tarih_gerekli';
  end if;
  if p_odeme_tipi not in ('nakit', 'havale', 'kredi_karti') then
    raise exception 'odeme_tipi_gecersiz';
  end if;
  if p_odeme_tipi = 'havale' then
    if p_banka_hesap_id is null
       or not exists (select 1 from klinik_banka_hesaplari b where b.id = p_banka_hesap_id and b.klinik_id = v_klinik) then
      raise exception 'banka_hesabi_gerekli';
    end if;
  end if;
  if p_odeme_tipi = 'kredi_karti' and p_kredi_karti_id is not null
     and not exists (select 1 from klinik_kredi_kartlari c where c.id = p_kredi_karti_id and c.klinik_id = v_klinik) then
    raise exception 'kart_bulunamadi';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_klinik::text || ':' || v_anahtar, 0));

  select b.borc, b.odenen into v_borc, v_odenen from klinik_cari_bakiyeler(v_klinik, v_anahtar) b;
  if coalesce(v_borc, 0) - coalesce(v_odenen, 0) < p_tutar - 0.005 then
    raise exception 'bakiye_asildi';
  end if;

  insert into klinik_cari_odeme (
    klinik_id, tedarikci_adi, tutar, tarih, odeme_tipi, banka_hesap_id, kredi_karti_id, aciklama, olusturan_kullanici_id
  ) values (
    v_klinik, btrim(p_tedarikci_adi), p_tutar, p_tarih, p_odeme_tipi,
    case when p_odeme_tipi = 'havale' then p_banka_hesap_id end,
    case when p_odeme_tipi = 'kredi_karti' then p_kredi_karti_id end,
    nullif(btrim(coalesce(p_aciklama, '')), ''),
    auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function klinik_cari_odeme_ekle(text, numeric, date, text, uuid, uuid, text) from public, anon;
grant execute on function klinik_cari_odeme_ekle(text, numeric, date, text, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- Cari borcu ödemelerin altına düşürmeyi engelle
-- "Cariye Ekle" giderinin tutarı düşürülür/silinir/başka türe çevrilirse kalan borç yapılmış ödemelerin
-- altına inmemeli (bakiye eksiye düşerdi). Yalnız kullanıcı oturumunda (auth.uid dolu) çalışır: klinik
-- silinirken kaskad ya da service-role bakım işlemleri engellenmesin.
create or replace function klinik_harcama_cari_butunluk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anahtar text;
  v_borc numeric;
  v_odenen numeric;
  v_yeni numeric := 0;
begin
  if auth.uid() is null or old.odeme_tipi is distinct from 'cari' then
    return coalesce(new, old);
  end if;

  v_anahtar := tedarikci_anahtari(old.tedarikci_adi);
  if tg_op = 'UPDATE' and new.odeme_tipi = 'cari' and tedarikci_anahtari(new.tedarikci_adi) = v_anahtar then
    v_yeni := new.tutar;
  end if;
  -- Borç artıyor/aynı kalıyorsa bakiye düşmez; kontrol gereksiz.
  if v_yeni >= old.tutar then
    return coalesce(new, old);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.klinik_id::text || ':' || v_anahtar, 0));

  select b.borc, b.odenen into v_borc, v_odenen from klinik_cari_bakiyeler(old.klinik_id, v_anahtar) b;
  if coalesce(v_borc, 0) - coalesce(v_odenen, 0) - old.tutar + v_yeni < -0.005 then
    raise exception 'cari_bakiye_negatif';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_klinik_harcama_cari_butunluk on klinik_harcama;
create trigger trg_klinik_harcama_cari_butunluk
  before update or delete on klinik_harcama
  for each row execute function klinik_harcama_cari_butunluk();

-- ---------------------------------------------------------------- Kredi kartı borcu
create or replace view klinik_kredi_karti_hareketleri with (security_invoker = true) as
  select 'gider'::text as kaynak, h.id::text as id, h.klinik_id, h.kredi_karti_id, h.tarih, 'harcama'::text as tip,
         h.tutar::numeric as tutar, h.tedarikci_adi as ad, h.aciklama as detay,
         null::text as yontem, null::uuid as banka_hesap_id
    from klinik_harcama h
   where h.odeme_tipi = 'kredi_karti'
  union all
  select 'cari_odeme', o.id::text, o.klinik_id, o.kredi_karti_id, o.tarih, 'harcama',
         o.tutar::numeric, o.tedarikci_adi, o.aciklama, null, null
    from klinik_cari_odeme o
   where o.odeme_tipi = 'kredi_karti'
  union all
  select 'kart_odemesi', p.id::text, p.klinik_id, p.kredi_karti_id, p.tarih, 'odeme',
         p.tutar::numeric, null, p.aciklama, p.odeme_tipi, p.banka_hesap_id
    from klinik_kredi_karti_odeme p;

-- Kart başına tüm zamanların harcama / ödeme toplamı (kredi_karti_id NULL → "kart seçilmedi").
create or replace function kredi_karti_borc_ozetleri(p_klinik_id uuid)
returns table (kredi_karti_id uuid, harcama numeric, odeme numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select k.kredi_karti_id,
         coalesce(sum(k.tutar) filter (where k.tip = 'harcama'), 0)::numeric,
         coalesce(sum(k.tutar) filter (where k.tip = 'odeme'), 0)::numeric
    from klinik_kredi_karti_hareketleri k
   where k.klinik_id = p_klinik_id
   group by k.kredi_karti_id
$$;

-- ---------------------------------------------------------------- Dönem başı bakiye RPC'leri
-- Gövdeler 20261005090000 (Kasa, Kredi Kartı) ve 20261008100000 (Banka)'daki ile AYNI; yalnız
-- cari ödemesi + kart ödemesi terimleri eklendi (imzalar aynı → CREATE OR REPLACE, overload yok).
create or replace function kasa_bakiye_once_toplam(p_once_tarih date)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts;

  v_toplam := v_toplam - coalesce((
    select sum(h.tutar) from hasta_bakiye_hareket h
    where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'nakit' and g.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(p.tutar) from personel_hesap_hareket p
    where p.klinik_id = v_klinik_id and p.odeme_tipi = 'nakit' and p.tur in ('odeme', 'avans') and p.tarih < p_once_tarih
  ), 0);

  -- Yön her zaman kaynak/hedef BAYRAĞINA göre (tip'e göre değil).
  v_toplam := v_toplam + coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.hedef_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.kaynak_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam + coalesce((
    select sum(d.tutar) from kasa_dengeleme d
    where d.klinik_id = v_klinik_id and d.created_at < v_once_ts
  ), 0);

  -- Tedarikçi cari ödemesi (nakit) ve karta yapılan nakit ödeme kasadan çıkar.
  v_toplam := v_toplam - coalesce((
    select sum(c.tutar) from klinik_cari_odeme c
    where c.klinik_id = v_klinik_id and c.odeme_tipi = 'nakit' and c.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(k.tutar) from klinik_kredi_karti_odeme k
    where k.klinik_id = v_klinik_id and k.odeme_tipi = 'nakit' and k.tarih < p_once_tarih
  ), 0);

  return v_toplam;
end;
$$;

create or replace function banka_bakiye_once_toplam_tumu(p_once_tarih date)
returns table(banka_hesap_id uuid, toplam numeric)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  return query
  select
    b.id,
    coalesce((
      select sum(h.tutar) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'banka_havalesi'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    + coalesce((
      select sum(h.tutar - round(h.tutar * coalesce(h.komisyon_orani, 0) / 100, 2)) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    - coalesce((
      select sum(h.tutar) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'banka_havalesi'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    - coalesce((
      select sum(g.tutar) from klinik_harcama g
      where g.klinik_id = v_klinik_id and g.odeme_tipi = 'havale' and g.banka_hesap_id = b.id and g.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(p.tutar) from personel_hesap_hareket p
      where p.klinik_id = v_klinik_id and p.odeme_tipi = 'havale' and p.tur in ('odeme', 'avans')
        and p.banka_hesap_id = b.id and p.tarih < p_once_tarih
    ), 0)
    + coalesce((
      select sum(n.tutar) from nakit_banka_hareketi n
      where n.klinik_id = v_klinik_id and n.hedef_banka_hesap_id = b.id and n.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(n.tutar) from nakit_banka_hareketi n
      where n.klinik_id = v_klinik_id and n.kaynak_banka_hesap_id = b.id and n.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(c.tutar) from klinik_cari_odeme c
      where c.klinik_id = v_klinik_id and c.odeme_tipi = 'havale' and c.banka_hesap_id = b.id and c.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(k.tutar) from klinik_kredi_karti_odeme k
      where k.klinik_id = v_klinik_id and k.odeme_tipi = 'havale' and k.banka_hesap_id = b.id and k.tarih < p_once_tarih
    ), 0)
  from klinik_banka_hesaplari b
  where b.klinik_id = v_klinik_id;
end;
$$;

-- Kredi Kartı mutabakat sayfası (POS rayı): kartla yapılan gider ZATEN çıkış sayılıyor; kartla yapılan cari
-- ödemesi de aynı şekilde çıkış olur. Kart ÖDEMESİ (karta yatan para) bu raya girmez — Kasa/Banka çıkışıdır.
create or replace function kredi_karti_bakiye_once_toplam(p_once_tarih date)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti' and h.created_at < v_once_ts;

  v_toplam := v_toplam - coalesce((
    select sum(h.tutar) from hasta_bakiye_hareket h
    where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'kredi_karti' and h.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'kredi_karti' and g.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(c.tutar) from klinik_cari_odeme c
    where c.klinik_id = v_klinik_id and c.odeme_tipi = 'kredi_karti' and c.tarih < p_once_tarih
  ), 0);

  return v_toplam;
end;
$$;

-- Kontrol:
-- SELECT proname, pronargs FROM pg_proc WHERE proname IN ('kasa_bakiye_once_toplam','banka_bakiye_once_toplam_tumu','kredi_karti_bakiye_once_toplam','klinik_cari_bakiyeler','kredi_karti_borc_ozetleri','klinik_cari_odeme_ekle'); -- her biri TEK satır
-- SELECT tedarikci_anahtari('  İPEK   Market ');  -- 'ipek market'
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='klinik_harcama'::regclass AND contype='c';
