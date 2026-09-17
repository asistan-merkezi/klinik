-- =====================================================================
-- Personel: Eğitim Bilgileri tek satırdan çoklu kayda (personel_egitim)
-- geçiyor; ayrıca Mesleki Belgeler'de "İmza Yetkilisi" onay kutusu için
-- personel.imza_yetkilisi_mi eklendi.
--
-- Not: personel.uzmanlik_tescil_no (genel "Uzmanlık/Diploma/Tescil No")
-- kasıtlı olarak BURADA silinmedi — personel_mesleki_belge.diploma_no ile
-- çakıştığı için formdan/detay sayfasından kaldırıldı ama mevcut veri
-- (varsa) korunuyor, kolon duruyor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) personel_egitim: çoklu eğitim/sertifika kaydı (lisans, yüksek lisans,
--    sertifika vb.) — personel_acil_kisi ile aynı RLS deseni.
-- ---------------------------------------------------------------------
create table if not exists personel_egitim (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references personel(id) on delete cascade,
  derece text,
  okul text,
  bolum text,
  yil text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personel_egitim enable row level security;

drop policy if exists "personel_egitim_select" on personel_egitim;
create policy "personel_egitim_select" on personel_egitim
  for select using (
    is_super_admin()
    or exists (select 1 from personel p where p.id = personel_egitim.personel_id and p.klinik_id = current_klinik_id()
               and (current_rol() = 'klinik_admin' or p.kullanici_id = auth.uid()))
  );

drop policy if exists "personel_egitim_insert" on personel_egitim;
create policy "personel_egitim_insert" on personel_egitim
  for insert with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_egitim.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_egitim_update" on personel_egitim;
create policy "personel_egitim_update" on personel_egitim
  for update using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_egitim.personel_id and p.klinik_id = current_klinik_id()))
  )
  with check (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_egitim.personel_id and p.klinik_id = current_klinik_id()))
  );

drop policy if exists "personel_egitim_delete" on personel_egitim;
create policy "personel_egitim_delete" on personel_egitim
  for delete using (
    is_super_admin()
    or (current_rol() = 'klinik_admin'
        and exists (select 1 from personel p where p.id = personel_egitim.personel_id and p.klinik_id = current_klinik_id()))
  );

create index if not exists idx_personel_egitim_personel_id on personel_egitim(personel_id);

drop trigger if exists trg_personel_egitim_updated_at on personel_egitim;
create trigger trg_personel_egitim_updated_at
  before update on personel_egitim for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2) Backfill: 20260917100000'de eklenen tek-satır eğitim alanlarında veri
--    varsa (dolu olan personel), personel_egitim'e tek satır olarak taşı.
-- ---------------------------------------------------------------------
insert into personel_egitim (personel_id, okul, bolum, yil)
select id, egitim_okul, egitim_brans, egitim_mezuniyet_yili
from personel
where egitim_okul is not null or egitim_brans is not null or egitim_mezuniyet_yili is not null;

alter table personel
  drop column if exists egitim_okul,
  drop column if exists egitim_brans,
  drop column if exists egitim_mezuniyet_yili;

-- ---------------------------------------------------------------------
-- 3) İmza Yetkilisi onay kutusu — işaretliyse Mesleki Belgeler'de
--    Uzmanlık Belge No / S.B. Tescil / E-imza / Sigorta / Kaşe alanları
--    formda gösterilir (Diploma No + Meslek Odası Sicil No her zaman açık).
-- ---------------------------------------------------------------------
alter table personel
  add column if not exists imza_yetkilisi_mi boolean not null default false;

-- Kontrol:
-- select column_name from information_schema.columns where table_name = 'personel_egitim';
-- select column_name from information_schema.columns where table_name = 'personel' and column_name in ('egitim_okul','egitim_brans','egitim_mezuniyet_yili','imza_yetkilisi_mi');
