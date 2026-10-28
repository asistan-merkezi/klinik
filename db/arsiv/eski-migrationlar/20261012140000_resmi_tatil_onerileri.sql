-- Resmi tatillerin yıllar içinde otomatik yenilenmesi.
--
-- resmi_tatil yalnız KESİNLEŞMİŞ tatilleri tutar (izin gün sayısı, izin onayında yazılan puantaj
-- ve Puantaj Cetveli doğrudan bunu okur). İki kaynak:
--   1) Sabit tarihli tatiller (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 29 Ekim):
--      /api/cron/resmi-tatil-guncelle bu yıl ve gelecek yıl için doğrudan global satır
--      (klinik_id NULL) olarak yazar — hesap kesin, onay gerekmez.
--   2) Dini bayramlar her yıl kayar ve Diyanet'in açıkladığı tarih hesaplanan takvimden
--      bir gün sapabilir (Nager.Date 2027 Ramazan'ı 10-12 Mart veriyor, Diyanet 9-11 Mart).
--      Bu yüzden ÖNERİ olarak bu tabloya, klinik başına "bekliyor" düşer; klinik yöneticisi
--      tarihleri kontrol edip (gerekirse düzeltip) onaylar → klinik_id'li resmi_tatil satırları.
--      Onaylanmamış öneri hiçbir hesaba girmez.

create table if not exists resmi_tatil_oneri (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  yil integer not null check (yil between 2000 and 2100),
  bayram text not null check (bayram in ('ramazan', 'kurban')),
  tarih date not null,
  ad text not null,
  kaynak text not null default 'nager',
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  karar_veren_id uuid references kullanici(id) on delete set null,
  karar_tarihi timestamptz,
  created_at timestamptz not null default now(),
  unique (klinik_id, bayram, tarih)
);

create index if not exists idx_resmi_tatil_oneri_klinik_yil on resmi_tatil_oneri (klinik_id, yil, bayram);

alter table resmi_tatil_oneri enable row level security;

-- Yalnız okuma; yazma cron (service_role) ve aşağıdaki RPC'den.
drop policy if exists resmi_tatil_oneri_select on resmi_tatil_oneri;
create policy resmi_tatil_oneri_select on resmi_tatil_oneri
  for select
  using (
    (klinik_id = (select current_klinik_id()) and (select current_rol()) = 'klinik_admin')
    or (select is_super_admin())
  );

grant select on resmi_tatil_oneri to authenticated;

-- Bir bayramın bekleyen önerisini onaylar ya da reddeder.
-- p_tarihler: onayda kullanılacak günler (yönetici öneriyi düzeltebilir). NULL ise önerilen
-- tarihler aynen alınır. Gün sayısı öneriyle aynı, ardışık ve aynı yıl içinde olmalı.
-- Başka bir satır (sabit tatil — örn. 19 Mayıs) o güne zaten tatil diyorsa satır eklenmez.
create or replace function resmi_tatil_onerisi_karar(
  p_yil integer,
  p_bayram text,
  p_onay boolean,
  p_tarihler date[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_oneri_tarihleri date[];
  v_tarihler date[];
  v_adet integer;
  v_bayram_adi text;
  v_eklenen integer := 0;
  i integer;
begin
  if current_rol() is distinct from 'klinik_admin' or v_klinik_id is null then
    raise exception 'yetkisiz';
  end if;
  if p_bayram not in ('ramazan', 'kurban') then
    raise exception 'bayram_gecersiz';
  end if;

  select array_agg(o.tarih order by o.tarih) into v_oneri_tarihleri
  from (
    select tarih from resmi_tatil_oneri
    where klinik_id = v_klinik_id and yil = p_yil and bayram = p_bayram and durum = 'bekliyor'
    for update
  ) o;

  v_adet := coalesce(array_length(v_oneri_tarihleri, 1), 0);
  if v_adet = 0 then
    raise exception 'oneri_bulunamadi';
  end if;

  if p_onay then
    v_tarihler := coalesce(p_tarihler, v_oneri_tarihleri);
    select array_agg(t order by t) into v_tarihler from (select distinct unnest(v_tarihler) as t) d;

    if coalesce(array_length(v_tarihler, 1), 0) <> v_adet
       or v_tarihler[v_adet] - v_tarihler[1] <> v_adet - 1 then
      raise exception 'tarihler_gecersiz';
    end if;
    if extract(year from v_tarihler[1]) <> p_yil or extract(year from v_tarihler[v_adet]) <> p_yil then
      raise exception 'tarihler_gecersiz';
    end if;

    v_bayram_adi := case p_bayram when 'ramazan' then 'Ramazan Bayramı' else 'Kurban Bayramı' end;
    for i in 1 .. v_adet loop
      if not exists (
        select 1 from resmi_tatil r
        where r.tarih = v_tarihler[i] and (r.klinik_id is null or r.klinik_id = v_klinik_id)
      ) then
        insert into resmi_tatil (klinik_id, tarih, ad)
        values (v_klinik_id, v_tarihler[i], format('%s (%s. gün)', v_bayram_adi, i));
        v_eklenen := v_eklenen + 1;
      end if;
    end loop;
  end if;

  update resmi_tatil_oneri
  set durum = case when p_onay then 'onaylandi' else 'reddedildi' end,
      karar_veren_id = auth.uid(),
      karar_tarihi = now()
  where klinik_id = v_klinik_id and yil = p_yil and bayram = p_bayram and durum = 'bekliyor';

  return v_eklenen;
end;
$$;

revoke all on function resmi_tatil_onerisi_karar(integer, text, boolean, date[]) from public, anon;
grant execute on function resmi_tatil_onerisi_karar(integer, text, boolean, date[]) to authenticated;
