-- Yetkilendirme mimarisi: Pozisyon -> Kullanıcı (override) -> Modül Ağacı.
-- Bugüne kadar sidebar görünürlüğü klinik_ayarlar.ayarlar.sidebar_gizli
-- (departman bazlı, 6 sabit üst-seviye anahtar) üzerinden; sayfa erişimi ise
-- her page.tsx'in kendi rol IN (...) kontrolüyle sağlanıyordu — ikisi ayrı
-- kaynaktı (CLAUDE.md "Teknik Borç: Sidebar rol görünürlüğü"). Bu migration
-- tek kaynağı kuruyor: pozisyonlar.allowed_modules (varsayılan şablon) +
-- kullanici.allowed_modules (kullanıcıya özel override, custom_permissions_enabled
-- ile açılır). Route/sidebar tarafı lib/auth/roles.ts'te ayrı bir turda gelir.

-- ----------------------------------------------------------------------------
-- 1) Şema
-- ----------------------------------------------------------------------------
alter table pozisyonlar add column if not exists allowed_modules jsonb not null default '[]'::jsonb;

-- kullanici'ya kolon eklenmesi çekirdek şemadan (20260726083923) beri ilk kez
-- oluyor — bilinçli not: bu tabloya dokunan tek migration budur.
alter table kullanici add column if not exists allowed_modules jsonb not null default '[]'::jsonb;
alter table kullanici add column if not exists custom_permissions_enabled boolean not null default false;
alter table kullanici add column if not exists permissions_version integer not null default 1;

-- ----------------------------------------------------------------------------
-- 2) Backfill — "bugün fiilen görülen" sidebar_gizli durumunu birebir yeni
--    sisteme taşır (klinik_admin -> ["*"], diğerleri -> taban modüller eksi
--    o departmanın gizli listesi). Kimse migration anında ne kazanır ne
--    kaybeder; ince ayar Ayarlar > Yetkilendirme'den sonradan yapılır.
-- ----------------------------------------------------------------------------
do $$
declare
  poz record;
  ka_ayarlar jsonb;
  gizli_jsonb jsonb;
  gizli_liste text[];
  taban text[] := array['ana_ekran', 'hastalar', 'randevular', 'finans', 'yonetim', 'ayarlar'];
  yeni_liste text[];
begin
  for poz in select id, klinik_id, grup, varsayilan_rol from pozisyonlar loop
    if poz.varsayilan_rol = 'klinik_admin' then
      update pozisyonlar set allowed_modules = '["*"]'::jsonb where id = poz.id;
      continue;
    end if;

    select ka.ayarlar into ka_ayarlar from klinik_ayarlar ka where ka.klinik_id = poz.klinik_id;
    gizli_jsonb := ka_ayarlar -> 'sidebar_gizli' -> poz.grup;
    if gizli_jsonb is null then
      -- lib/panel/menu-gruplari.ts > SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN ile
      -- birebir aynı varsayılan (tek satır: Klinik & Terapi Departmanı -> finans gizli).
      gizli_jsonb := case when poz.grup = 'Klinik & Terapi Departmanı' then '["finans"]'::jsonb else '[]'::jsonb end;
    end if;

    gizli_liste := array(select jsonb_array_elements_text(gizli_jsonb));
    yeni_liste := array(select unnest(taban) except select unnest(gizli_liste));

    update pozisyonlar set allowed_modules = to_jsonb(yeni_liste) where id = poz.id;
  end loop;

  -- super_admin platform rolü klinik pozisyonuna bağlı değil, doğrudan tam erişir.
  update kullanici set allowed_modules = '["*"]'::jsonb where rol = 'super_admin';
end $$;

-- ----------------------------------------------------------------------------
-- 3) Koruma + versiyon artırma trigger'ı (kullanici).
--    kullanici_update_kendi_veya_admin RLS policy'si SATIR seviyesinde
--    (id = auth.uid() OR ...) — KOLON seviyesinde değil. Yani bugün teorik
--    olarak bir kullanıcı doğrudan PostgREST'e kendi satırına rol/allowed_modules
--    yazan bir PATCH atabilir (uygulamanın kendi server action'ları zaten
--    service-role client kullanıyor, risk sadece doğrudan PostgREST erişiminde).
--    Bu trigger hem yeni kolonları hem mevcut rol kolonundaki aynı sınıf
--    riski kapatır; permissions_version'ı da otomatik artırır.
-- ----------------------------------------------------------------------------
create or replace function kullanici_yetki_degisikligi_koru()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.rol is distinct from old.rol
     or new.allowed_modules is distinct from old.allowed_modules
     or new.custom_permissions_enabled is distinct from old.custom_permissions_enabled then
    if current_rol() not in ('klinik_admin', 'super_admin') then
      raise exception 'yetkisiz_yetki_degisikligi';
    end if;
    new.permissions_version := old.permissions_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_kullanici_yetki_degisikligi_koru on kullanici;
create trigger trg_kullanici_yetki_degisikligi_koru
  before update on kullanici
  for each row execute function kullanici_yetki_degisikligi_koru();

-- ----------------------------------------------------------------------------
-- 4) Pozisyon izni değişince, o pozisyondan MİRAS ALAN (custom_permissions_enabled
--    = false) kullanıcıların permissions_version'ını da artır.
-- ----------------------------------------------------------------------------
create or replace function pozisyon_izin_versiyonu_yay()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  update kullanici k
  set permissions_version = k.permissions_version + 1
  from personel p
  where p.pozisyon_id = new.id
    and p.kullanici_id = k.id
    and k.custom_permissions_enabled = false;
  return new;
end;
$$;

drop trigger if exists trg_pozisyon_izin_versiyonu_yay on pozisyonlar;
create trigger trg_pozisyon_izin_versiyonu_yay
  after update of allowed_modules on pozisyonlar
  for each row execute function pozisyon_izin_versiyonu_yay();

-- ----------------------------------------------------------------------------
-- 5) Denetim — hassas izin alanı değişiklikleri audit_log'a düşer (mevcut
--    generic audit_log_yaz() deseniyle, ör. personel_hesap_hareket).
-- ----------------------------------------------------------------------------
drop trigger if exists trg_pozisyonlar_izin_audit on pozisyonlar;
create trigger trg_pozisyonlar_izin_audit
  after update of allowed_modules on pozisyonlar
  for each row execute function audit_log_yaz();

drop trigger if exists trg_kullanici_izin_audit on kullanici;
create trigger trg_kullanici_izin_audit
  after update of rol, allowed_modules, custom_permissions_enabled on kullanici
  for each row execute function audit_log_yaz();
