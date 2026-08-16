-- Pozisyonlar sekmesi (Blok 3b): platform şablonları + klinik bazlı pozisyon
-- kataloğu. personel.gorev serbest metin olmaya devam ediyor (geriye dönük
-- uyumluluk, hiçbir yerde kaldırılmadı) — pozisyon_id yeni, yapılandırılmış
-- bir üst katman: sistem erişimi/varsayılan rol/ücret tipi/puantaj modu gibi
-- 4 ayarı bir kere tanımlayıp personele bağlamak için.

-- ----------------------------------------------------------------------------
-- 1) pozisyon_sablonlari — platform geneli referans katalog (klinik_id yok,
--    tıpkı olcek_tanimi'nin klinik_id NULL satırları gibi salt-okunur şablon).
-- ----------------------------------------------------------------------------
create table pozisyon_sablonlari (
  id uuid primary key default gen_random_uuid(),
  ad text not null unique,
  grup text not null,
  sira integer not null default 0,
  sistem_erisimi boolean not null default false,
  varsayilan_rol kullanici_rol_tipi not null default 'terapist',
  ucret_tipi text not null default 'aylik_maas' check (ucret_tipi in ('aylik_maas', 'prim_usulu')),
  puantaj_modu text not null default 'gunluk' check (puantaj_modu in ('gunluk', 'esnek', 'takipsiz')),
  created_at timestamptz not null default now()
);

comment on column pozisyon_sablonlari.ucret_tipi is
  'aylik_maas: personel.maas sabit tutar; prim_usulu: terapist.maas_hesaplama_modeli üzerinden hesaplanır.';
comment on column pozisyon_sablonlari.puantaj_modu is
  'gunluk: personel_puantaj günlük giriş/çıkış takibi; esnek: saat takibi yok ama gün bazlı devam/izin girilir; takipsiz: puantaj cetvelinde hiç görünmez.';

alter table pozisyon_sablonlari enable row level security;

create policy pozisyon_sablonlari_select on pozisyon_sablonlari
  for select to authenticated
  using (true);

-- Şablon kataloğu sadece migration/seed ile değişir, uygulamadan hiçbir
-- INSERT/UPDATE/DELETE policy'si YOK (bilinçli — kullanıcı isteği "platform
-- şablonu" kavramını taşıyor, klinik bazlı özelleştirme pozisyonlar'da).

-- ----------------------------------------------------------------------------
-- 2) pozisyonlar — klinik bazlı, kullanıcının verdiği birebir şema.
-- ----------------------------------------------------------------------------
create table pozisyonlar (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  sablon_id uuid references pozisyon_sablonlari(id) on delete set null,
  ad text not null,
  grup text not null,
  sira integer not null default 0,
  aktif boolean not null default true,
  sistem_erisimi boolean not null default false,
  varsayilan_rol kullanici_rol_tipi not null default 'terapist',
  ucret_tipi text not null default 'aylik_maas' check (ucret_tipi in ('aylik_maas', 'prim_usulu')),
  puantaj_modu text not null default 'gunluk' check (puantaj_modu in ('gunluk', 'esnek', 'takipsiz')),
  ozel_mi boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (klinik_id, ad)
);

create index idx_pozisyonlar_klinik on pozisyonlar (klinik_id);

create trigger trg_pozisyonlar_updated_at
  before update on pozisyonlar
  for each row execute function set_updated_at();

alter table pozisyonlar enable row level security;

create policy pozisyonlar_select on pozisyonlar
  for select to authenticated
  using (klinik_id = current_klinik_id() or is_super_admin());

create policy pozisyonlar_insert on pozisyonlar
  for insert to authenticated
  with check (klinik_id = current_klinik_id() and (current_rol() = 'klinik_admin' or is_super_admin()));

create policy pozisyonlar_update on pozisyonlar
  for update to authenticated
  using (klinik_id = current_klinik_id() and (current_rol() = 'klinik_admin' or is_super_admin()))
  with check (klinik_id = current_klinik_id() and (current_rol() = 'klinik_admin' or is_super_admin()));

-- Bilinçli olarak DELETE policy'si YOK — kullanıcı kararı: pozisyon hiç
-- silinemez, sadece pasife alınabilir (aktif=false).

-- Bağlı (aktif) personeli olan bir pozisyon pasife alınamaz — RLS'in
-- yapamayacağı bir cross-tablo agregasyon kontrolü, trigger ile.
create or replace function pozisyon_pasif_engelle()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.aktif = false and old.aktif = true then
    if exists (select 1 from personel where pozisyon_id = new.id and aktif = true) then
      raise exception 'pozisyon_personel_bagli';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_pozisyon_pasif_engelle
  before update on pozisyonlar
  for each row execute function pozisyon_pasif_engelle();

-- ----------------------------------------------------------------------------
-- 3) personel.pozisyon_id
-- ----------------------------------------------------------------------------
alter table personel add column pozisyon_id uuid references pozisyonlar(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4) Seed: "Klinik sektörü" 9 şablon (sistem_erisimi/varsayilan_rol/ucret_tipi/
--    puantaj_modu hepsi dolduruldu).
-- ----------------------------------------------------------------------------
insert into pozisyon_sablonlari (ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu) values
  ('Fizyoterapist',      'Klinik Ekibi', 10, true,  'terapist',     'prim_usulu', 'gunluk'),
  ('Doktor',             'Klinik Ekibi', 20, true,  'terapist',     'prim_usulu', 'gunluk'),
  ('Hemşire',            'Klinik Ekibi', 30, true,  'terapist',     'aylik_maas', 'gunluk'),
  ('Masör',              'Klinik Ekibi', 40, true,  'terapist',     'prim_usulu', 'gunluk'),
  ('Diyetisyen',         'Klinik Ekibi', 50, true,  'terapist',     'prim_usulu', 'gunluk'),
  ('Klinik Yöneticisi',  'Yönetim',      60, true,  'klinik_admin', 'aylik_maas', 'esnek'),
  ('Muhasebe',           'Yönetim',      70, true,  'muhasebe',     'aylik_maas', 'esnek'),
  ('Resepsiyon',         'Operasyon',    80, true,  'resepsiyon',   'aylik_maas', 'gunluk'),
  ('Temizlik',           'Destek',       90, false, 'terapist',     'aylik_maas', 'gunluk');

-- ----------------------------------------------------------------------------
-- 5) Her mevcut klinik için şablonlardan gerçek pozisyon satırları oluştur.
-- ----------------------------------------------------------------------------
insert into pozisyonlar (klinik_id, sablon_id, ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu)
select k.id, s.id, s.ad, s.grup, s.sira, s.sistem_erisimi, s.varsayilan_rol, s.ucret_tipi, s.puantaj_modu
from klinik k
cross join pozisyon_sablonlari s;

-- ----------------------------------------------------------------------------
-- 6) Eşleşmeyen personel.gorev değerleri için özel (ozel_mi=true) pozisyon
--    otomatik oluşturulur — hiçbir personel pozisyonsuz kalmasın diye.
-- ----------------------------------------------------------------------------
insert into pozisyonlar (klinik_id, ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi)
select distinct
  p.klinik_id,
  p.gorev,
  'Diğer',
  999,
  true,
  case when ku.rol in ('klinik_admin', 'resepsiyon', 'terapist', 'muhasebe') then ku.rol else 'terapist' end,
  'aylik_maas',
  'gunluk',
  true
from personel p
left join kullanici ku on ku.id = p.kullanici_id
where not exists (
  select 1 from pozisyonlar poz where poz.klinik_id = p.klinik_id and poz.ad = p.gorev
);

-- ----------------------------------------------------------------------------
-- 7) Backfill: her personel kendi gorev metnine eşleşen pozisyona bağlanır.
-- ----------------------------------------------------------------------------
update personel p
set pozisyon_id = poz.id
from pozisyonlar poz
where poz.klinik_id = p.klinik_id
  and poz.ad = p.gorev
  and p.pozisyon_id is null;
