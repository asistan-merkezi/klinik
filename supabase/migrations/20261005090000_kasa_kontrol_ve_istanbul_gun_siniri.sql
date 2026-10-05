-- Kasa/Banka/Kredi Kartı turu (2026-10-05). İdempotent; mevcut veriye dokunmaz.
--
-- 1) KASA KONTROL: `kasa_dengeleme` tablosu — işaretli tutar (+ kasaya ekler, − kasadan düşer).
--    Kasa başlangıç tutarı hâlâ klinik_ayarlar.ayarlar.kasa jsonb'sinde (yeni anahtarlar:
--    baslangic_zamani, baslangic_giren — kolon/migration gerekmez).
-- 2) GÜN SINIRI: üç *_bakiye_once_toplam RPC'si `p_once_tarih::timestamptz` kullanıyordu — bu,
--    oturum saat dilimine (Supabase'de UTC) göre gece yarısıdır; sayfalar da `created_at`'i UTC
--    gününe göre gruplayıp UTC sınırlarıyla sorguluyordu, yani İstanbul'da 00:00-03:00 arası girilen
--    ödeme bir önceki güne yazılıyordu (Raporlar ise İstanbul günü kullanıyor → ekranlar tutmuyordu).
--    Artık sınır İstanbul gün başı. İmzalar AYNI (CREATE OR REPLACE) → overload/PGRST203 riski yok.
-- 3) Tarih indeksleri (yıllarca birikecek tablolarda dönem sorguları için).

-- ---------------------------------------------------------------- Kasa Kontrol
create table if not exists kasa_dengeleme (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  -- İşaretli: pozitif = kasaya eklenen (Tahsilat sütunu), negatif = kasadan düşen (Ödenen Gider).
  tutar numeric not null check (tutar <> 0),
  aciklama text,
  ekleyen_kullanici_id uuid references kullanici(id) on delete set null,
  -- Kullanıcı sonradan silinse/adı değişse de "kim girdi" kaydı okunabilsin diye anlık ad.
  ekleyen_ad text not null,
  created_at timestamptz not null default now()
);

alter table kasa_dengeleme enable row level security;

create index if not exists idx_kasa_dengeleme_klinik_created on kasa_dengeleme (klinik_id, created_at);

drop policy if exists "kasa_dengeleme_select" on kasa_dengeleme;
create policy "kasa_dengeleme_select" on kasa_dengeleme
  for select using (
    (klinik_id = current_klinik_id() and current_rol() in ('klinik_admin', 'muhasebe'))
    or is_super_admin()
  );

drop policy if exists "kasa_dengeleme_yonet_admin" on kasa_dengeleme;
create policy "kasa_dengeleme_yonet_admin" on kasa_dengeleme
  for all using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

drop trigger if exists trg_kasa_dengeleme_denetim on kasa_dengeleme;
create trigger trg_kasa_dengeleme_denetim
  after insert or update or delete on kasa_dengeleme
  for each row execute function audit_log_degisiklik_yaz();

-- ------------------------------------------------------------------- Tarih indeksleri
create index if not exists idx_klinik_harcama_klinik_tarih on klinik_harcama (klinik_id, tarih);
create index if not exists idx_personel_hesap_hareket_klinik_tarih on personel_hesap_hareket (klinik_id, tarih);
create index if not exists idx_nakit_banka_hareketi_klinik_tarih on nakit_banka_hareketi (klinik_id, tarih);

-- ------------------------------------------------------------------- RPC'ler (İstanbul gün sınırı)
create or replace function kasa_bakiye_once_toplam(p_once_tarih date)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  -- p_once_tarih'in İSTANBUL gün başı (timestamptz); oturum saat diliminden bağımsız.
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts;

  -- Hasta nakit iadesi kasadan çıkar.
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

  -- Yön her zaman kaynak/hedef BAYRAĞINA göre (tip'e göre değil): 'gelen' kayıtta para giren
  -- hesap hedef_*'tadır, kaynak_* boştur.
  v_toplam := v_toplam + coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.hedef_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.kaynak_kasa = true and n.tarih < p_once_tarih
  ), 0);

  -- Kasa Dengeleme (işaretli tutar).
  v_toplam := v_toplam + coalesce((
    select sum(d.tutar) from kasa_dengeleme d
    where d.klinik_id = v_klinik_id and d.created_at < v_once_ts
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
  from klinik_banka_hesaplari b
  where b.klinik_id = v_klinik_id;
end;
$$;

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

  return v_toplam;
end;
$$;

-- Kontrol:
-- SELECT proname, pronargs FROM pg_proc WHERE proname IN ('kasa_bakiye_once_toplam','banka_bakiye_once_toplam_tumu','kredi_karti_bakiye_once_toplam'); -- her biri TEK satır
-- SELECT (date '2026-10-01')::timestamp at time zone 'Europe/Istanbul'; -- 2026-09-30 21:00:00+00
-- Kasa dengeleme: eski RPC sonucuna göre yalnız İstanbul 00:00-03:00 arası kayıtlar ile dengeleme satırları farklılaşır.
