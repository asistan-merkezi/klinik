-- =====================================================================
-- Personel Detay: Kişisel/İş/Sistem Yetki/Mesleki Belge alanları
--
-- Not: bu, kullanıcının elle yapıştırdığı taslak migration'ın düzeltilmiş
-- hâlidir — taslak canlı veritabanına HİÇ UYGULANMAMIŞTI (information_schema
-- ile doğrulandı: personel_hassas/personel_acil_kisi/personel_mesleki_belge
-- yoktu, personel'de yeni kolon yoktu). Taslakta bulunan hatalar:
--   - personel_acil_kisi/personel_mesleki_belge RLS policy'leri "p.user_id"
--     referans veriyordu; personel tablosunda böyle bir kolon yok, kolon adı
--     her yerde kullanici_id — düzeltildi.
--   - personel.telefon (kullanici.telefon ile), personel.ise_baslama_tarihi
--     (mevcut personel.ise_giris_tarihi ile), personel.ev_adresi (bir önceki
--     turda eklenen personel.adres/il/ilce/mahalle ile) aynı bilgiyi ikinci
--     kez tutacaktı — eklenmedi, mevcut kolonlar kullanılacak.
--   - cinsiyet check değeri 'belirtilmedi' yerine hasta.cinsiyet ile tutarlı
--     olsun diye 'belirtilmemis' yapıldı.
-- Tek blok, idempotent, tekrar çalıştırılabilir.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) personel: kişisel & iş bilgileri (hassas olmayan, tekrarsız alanlar)
-- ---------------------------------------------------------------------
alter table personel
  add column if not exists dogum_tarihi date,
  add column if not exists dogum_yeri text,
  add column if not exists cinsiyet text check (cinsiyet in ('erkek','kadin','belirtilmemis')),
  add column if not exists eposta text,
  add column if not exists departman text,
  add column if not exists calisma_tipi text check (calisma_tipi in ('tam_zamanli','yari_zamanli','vardiyali','prim_usulu')),
  add column if not exists sgk_sicil_no text,
  -- var olan rol sistemine ek istisna yetkisi (ör. resepsiyonun finans görmesi gibi
  -- özel durumlar) — şema burada hazırlanıyor, bu turda hiçbir RLS policy'si veya
  -- UI bu kolonu okumuyor/yazmıyor; ileride gerçek bir yetki matrisi kurulunca
  -- devreye alınacak (yarım/etkisiz bir UI eklememek için şimdilik boş bırakıldı).
  add column if not exists ozel_yetki_override jsonb not null default '{}'::jsonb,
  add column if not exists ise_baslama_notu text;

comment on column personel.ozel_yetki_override is 'Şema hazır, henüz hiçbir RLS/UI bu alanı kullanmıyor — placeholder.';

-- ---------------------------------------------------------------------
-- 2) personel_hassas: TC kimlik / pasaport — pgcrypto ile şifreli, 1-1
--    Not: mevcut personel.tc_kimlik_no (düz metin) kasıtlı olarak burada
--    değiştirilmedi/taşınmadı — anahtar henüz kurulu değilken canlı veriyi
--    şifreleyip eski kolonu silmek tek yönlü/geri alınamaz bir adım olurdu.
--    Anahtar kurulduktan sonra ayrı bir backfill+drop migration'ı istenirse
--    yazılabilir. Yeni kayıtlar bundan sonra SADECE bu tabloya yazılacak.
-- ---------------------------------------------------------------------
create table if not exists personel_hassas (
  personel_id uuid primary key references personel(id) on delete cascade,
  tc_kimlik_sifreli bytea,
  pasaport_no_sifreli bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personel_hassas enable row level security;

drop policy if exists "personel_hassas_select_admin" on personel_hassas;
create policy "personel_hassas_select_admin" on personel_hassas
  for select using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_hassas.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_hassas_upsert_admin" on personel_hassas;
create policy "personel_hassas_upsert_admin" on personel_hassas
  for insert with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_hassas.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_hassas_update_admin" on personel_hassas;
create policy "personel_hassas_update_admin" on personel_hassas
  for update using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_hassas.personel_id and p.klinik_id = current_klinik_id()))
  )
  with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_hassas.personel_id and p.klinik_id = current_klinik_id()))
  );

-- Not: yukarıdaki table-level RLS uygulama tarafından DOĞRUDAN kullanılmıyor —
-- şifreleme/çözme SECURITY DEFINER RPC'ler (aşağıda) üzerinden yapılıyor ki
-- düz metin hiçbir zaman client'a dönmesin. RLS yine de savunma-derinliği
-- (defense-in-depth) için tutuluyor.

-- ---------------------------------------------------------------------
-- 3) personel_hassas_kaydet / personel_hassas_maskeli_getir RPC'leri
--
-- Şifreleme anahtarı BU MİGRATION'A GÖMÜLMEDİ (sır repo'ya yazılmaz).
-- Uygulanmadan önce/sonra veritabanında bir kere şu çalıştırılmalı
-- (Supabase Dashboard SQL Editor veya psql, GÜÇLÜ rastgele bir değerle):
--
--   ALTER DATABASE postgres SET app.settings.encryption_key = '<GÜÇLÜ-RASTGELE-DEĞER>';
--
-- Bu bir database-level default olduğu için pgbouncer transaction-mode pooler
-- altında da (session-level SET'in aksine) güvenilir çalışır. Anahtar
-- kaybolursa şifrelenmiş TC kimlik/pasaport verileri KALICI OLARAK
-- okunamaz hale gelir — güvenli bir yerde (password manager/Vault) yedeklenmeli.
-- Anahtar kurulana kadar RPC'ler düz metni şifrelemeden reddeder
-- (aşağıdaki 'sifreleme_anahtari_kurulu_degil' hatası).
-- ---------------------------------------------------------------------
create or replace function personel_hassas_kaydet(p_personel_id uuid, p_tc_kimlik text, p_pasaport text)
returns void as $$
declare
  v_personel personel%rowtype;
  v_key text;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found then
    raise exception 'personel_bulunamadi';
  end if;

  if not (
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id())
  ) then
    raise exception 'yetkisiz';
  end if;

  v_key := current_setting('app.settings.encryption_key', true);
  if v_key is null or v_key = '' then
    raise exception 'sifreleme_anahtari_kurulu_degil';
  end if;

  insert into personel_hassas (personel_id, tc_kimlik_sifreli, pasaport_no_sifreli)
  values (
    p_personel_id,
    case when p_tc_kimlik is null or p_tc_kimlik = '' then null else pgp_sym_encrypt(p_tc_kimlik, v_key) end,
    case when p_pasaport is null or p_pasaport = '' then null else pgp_sym_encrypt(p_pasaport, v_key) end
  )
  on conflict (personel_id) do update set
    tc_kimlik_sifreli = excluded.tc_kimlik_sifreli,
    pasaport_no_sifreli = excluded.pasaport_no_sifreli,
    updated_at = now();

  insert into audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  values (v_personel.klinik_id, auth.uid(), 'update', 'personel_hassas', p_personel_id, '{}'::jsonb);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function personel_hassas_kaydet(uuid, text, text) from public;
grant execute on function personel_hassas_kaydet(uuid, text, text) to authenticated;

-- Düz metin asla dönmez — sadece "var mı" ve son 2 hane.
create or replace function personel_hassas_maskeli_getir(p_personel_id uuid)
returns jsonb as $$
declare
  v_personel personel%rowtype;
  v_row personel_hassas%rowtype;
  v_key text;
  v_tc text;
  v_pasaport text;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found then
    raise exception 'personel_bulunamadi';
  end if;

  if not (
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id())
    or v_personel.kullanici_id = auth.uid()
  ) then
    raise exception 'yetkisiz';
  end if;

  select * into v_row from personel_hassas where personel_id = p_personel_id;
  if not found then
    return jsonb_build_object('tc_kimlik_var', false, 'tc_kimlik_son2', null, 'pasaport_var', false, 'pasaport_son2', null, 'anahtar_kurulu', true);
  end if;

  v_key := current_setting('app.settings.encryption_key', true);

  if v_key is not null and v_key <> '' then
    begin
      if v_row.tc_kimlik_sifreli is not null then
        v_tc := pgp_sym_decrypt(v_row.tc_kimlik_sifreli, v_key);
      end if;
      if v_row.pasaport_no_sifreli is not null then
        v_pasaport := pgp_sym_decrypt(v_row.pasaport_no_sifreli, v_key);
      end if;
    exception when others then
      v_tc := null;
      v_pasaport := null;
    end;
  end if;

  return jsonb_build_object(
    'tc_kimlik_var', v_row.tc_kimlik_sifreli is not null,
    'tc_kimlik_son2', case when v_tc is not null then right(v_tc, 2) else null end,
    'pasaport_var', v_row.pasaport_no_sifreli is not null,
    'pasaport_son2', case when v_pasaport is not null then right(v_pasaport, 2) else null end,
    'anahtar_kurulu', v_key is not null and v_key <> ''
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function personel_hassas_maskeli_getir(uuid) from public;
grant execute on function personel_hassas_maskeli_getir(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) personel_acil_kisi: acil durum kişisi (hassas değil, ayrı tablo)
-- ---------------------------------------------------------------------
create table if not exists personel_acil_kisi (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references personel(id) on delete cascade,
  ad_soyad text not null,
  yakinlik text not null,
  telefon text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personel_acil_kisi enable row level security;

drop policy if exists "personel_acil_kisi_select" on personel_acil_kisi;
create policy "personel_acil_kisi_select" on personel_acil_kisi
  for select using (
    is_super_admin()
    or exists (select 1 from personel p where p.id = personel_acil_kisi.personel_id and p.klinik_id = current_klinik_id()
               and (current_rol() = 'klinik_admin' or p.kullanici_id = auth.uid()))
  );

drop policy if exists "personel_acil_kisi_insert" on personel_acil_kisi;
create policy "personel_acil_kisi_insert" on personel_acil_kisi
  for insert with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_acil_kisi.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_acil_kisi_update" on personel_acil_kisi;
create policy "personel_acil_kisi_update" on personel_acil_kisi
  for update using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_acil_kisi.personel_id and p.klinik_id = current_klinik_id()))
  )
  with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_acil_kisi.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_acil_kisi_delete" on personel_acil_kisi;
create policy "personel_acil_kisi_delete" on personel_acil_kisi
  for delete using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_acil_kisi.personel_id and p.klinik_id = current_klinik_id()))
  );

create index if not exists idx_personel_acil_kisi_personel_id on personel_acil_kisi(personel_id);

drop trigger if exists trg_personel_acil_kisi_updated_at on personel_acil_kisi;
create trigger trg_personel_acil_kisi_updated_at
  before update on personel_acil_kisi for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 5) personel_mesleki_belge: sadece hekime/terapiste müdahale eden roller
--    Not: e-imza PIN / e-reçete PIN buraya YAZILMIYOR — sadece referans/seri no.
-- ---------------------------------------------------------------------
create table if not exists personel_mesleki_belge (
  personel_id uuid primary key references personel(id) on delete cascade,
  diploma_no text,
  uzmanlik_belge_no text,
  meslek_odasi_sicil_no text,
  saglik_bakanligi_tescil_no text,
  e_imza_sertifika_seri_no text,      -- sadece referans; PIN yok
  e_imza_gecerlilik_tarihi date,
  kase_gorsel_url text,               -- Supabase Storage signed URL üretimi için path
  mali_sorumluluk_sigorta_police_no text,
  mali_sorumluluk_sigorta_bitis_tarihi date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personel_mesleki_belge enable row level security;

drop policy if exists "personel_mesleki_belge_select" on personel_mesleki_belge;
create policy "personel_mesleki_belge_select" on personel_mesleki_belge
  for select using (
    is_super_admin()
    or exists (select 1 from personel p where p.id = personel_mesleki_belge.personel_id and p.klinik_id = current_klinik_id()
               and (current_rol() = 'klinik_admin' or p.kullanici_id = auth.uid()))
  );

drop policy if exists "personel_mesleki_belge_upsert" on personel_mesleki_belge;
create policy "personel_mesleki_belge_upsert" on personel_mesleki_belge
  for insert with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_mesleki_belge.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_mesleki_belge_update" on personel_mesleki_belge;
create policy "personel_mesleki_belge_update" on personel_mesleki_belge
  for update using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_mesleki_belge.personel_id and p.klinik_id = current_klinik_id()))
  )
  with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_mesleki_belge.personel_id and p.klinik_id = current_klinik_id()))
  );

-- updated_at trigger (varsa set_updated_at() fonksiyonunu tekrar yaratmaz)
drop trigger if exists trg_personel_hassas_updated_at on personel_hassas;
create trigger trg_personel_hassas_updated_at
  before update on personel_hassas
  for each row execute function set_updated_at();

drop trigger if exists trg_personel_mesleki_belge_updated_at on personel_mesleki_belge;
create trigger trg_personel_mesleki_belge_updated_at
  before update on personel_mesleki_belge
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 6) Storage: personel-belge bucket'ı (private) — sadece kaşe görseli
--    Path deseni: {klinik_id}/{personel_id}/kase.{ext}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personel-belge', 'personel-belge', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "personel_belge_storage_select" on storage.objects;
create policy "personel_belge_storage_select" on storage.objects
  for select using (
    bucket_id = 'personel-belge'
    and (
      is_super_admin()
      or ((storage.foldername(name))[1])::uuid = current_klinik_id()
    )
  );

drop policy if exists "personel_belge_storage_insert" on storage.objects;
create policy "personel_belge_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'personel-belge'
    and ((storage.foldername(name))[1])::uuid = current_klinik_id()
    and current_rol() = 'klinik_admin'
  );

drop policy if exists "personel_belge_storage_update" on storage.objects;
create policy "personel_belge_storage_update" on storage.objects
  for update using (
    bucket_id = 'personel-belge'
    and ((storage.foldername(name))[1])::uuid = current_klinik_id()
    and current_rol() = 'klinik_admin'
  )
  with check (
    bucket_id = 'personel-belge'
    and ((storage.foldername(name))[1])::uuid = current_klinik_id()
    and current_rol() = 'klinik_admin'
  );

drop policy if exists "personel_belge_storage_delete" on storage.objects;
create policy "personel_belge_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'personel-belge'
    and ((storage.foldername(name))[1])::uuid = current_klinik_id()
    and current_rol() = 'klinik_admin'
  );

-- Kontrol:
-- select column_name from information_schema.columns where table_name = 'personel' and column_name like '%dogum%';
-- select table_name from information_schema.tables where table_name in ('personel_hassas','personel_acil_kisi','personel_mesleki_belge');
-- select proname from pg_proc where proname in ('personel_hassas_kaydet','personel_hassas_maskeli_getir');
-- select id from storage.buckets where id = 'personel-belge';
