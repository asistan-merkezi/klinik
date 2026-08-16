-- Personel İzin Talep-Onay Akışı
-- ============================================================================
-- terapist_izin (0 satır, hiçbir app kodu kullanmıyor — grep ile teyitli)
-- tamamen kaldırılıp yerine personel_id bazlı (terapist'e özel değil, TÜM
-- personel için) daha zengin bir sistem getiriliyor: bakiye takibi (kıdem
-- bazlı hak + devir + manuel düzeltme), belge yükleme, iş günü sayacı
-- (hafta tatili + resmi tatil hariç), çakışma tespiti, ve TÜM durum
-- geçişlerinin SECURITY DEFINER RPC'lerde zorlandığı katı bir state machine.
--
-- Tasarım kararı: personel_izin_talebi tablosunda İNSERT/UPDATE için HİÇ
-- doğrudan RLS policy'si YOK — sadece SELECT. Tüm yazma işlemleri 4 RPC
-- üzerinden ("hepsi server action'da zorlanacak, client'ta değil" isteğiyle
-- birebir) — PostgREST üzerinden doğrudan .insert()/.update() denemesi RLS
-- tarafından (eşleşen policy yok) reddedilir.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) terapist_izin'i kaldır (0 satır, app kodu hiç kullanmıyor)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_terapist_izin_audit on terapist_izin;
drop trigger if exists trg_terapist_izin_klinik_id on terapist_izin;
drop trigger if exists trg_terapist_izin_updated_at on terapist_izin;
drop table if exists terapist_izin;

-- ----------------------------------------------------------------------------
-- 2) resmi_tatil — hafta tatili DIŞINDA sayılmayacak günler.
--    klinik_id NULL = platform geneli (tüm kliniklere uygulanır, olcek_tanimi
--    deseniyle aynı); klinik kendi özel/bölgesel tatilini de ekleyebilir.
-- ----------------------------------------------------------------------------
create table resmi_tatil (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid references klinik(id) on delete cascade,
  tarih date not null,
  ad text not null,
  created_at timestamptz not null default now(),
  unique (klinik_id, tarih)
);

create index idx_resmi_tatil_tarih on resmi_tatil (tarih);

alter table resmi_tatil enable row level security;

create policy resmi_tatil_select on resmi_tatil
  for select
  using (klinik_id is null or klinik_id = current_klinik_id() or is_super_admin());

create policy resmi_tatil_yonet_admin on resmi_tatil
  for all
  using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

-- Sabit tarihli (dini bayramlar HARİÇ — hicri takvime bağlı, yıldan yıla
-- kayar, güvenilir kaynaksız tahmin edilmedi) ulusal resmi tatiller +
-- 2026 dini bayram tarihleri (kaynak: enuygun.com/turktelekom.com.tr 2026
-- resmi tatil takvimleri, 2026-08-18'de doğrulandı). Yarım günler (arife)
-- dahil edilmedi — bu sistem gün bazlı sayıyor, yarım gün kavramı yok.
-- ÖNEMLİ KISIT: 2027+ için dini bayram tarihleri burada YOK, klinik_admin
-- ileride manuel eklemeli (henüz bir yönetim ekranı da yok — bu turun
-- kapsamı dışı, sadece tablo+seed var).
insert into resmi_tatil (klinik_id, tarih, ad) values
  (null, '2026-01-01', 'Yılbaşı'),
  (null, '2026-03-20', 'Ramazan Bayramı (1. gün)'),
  (null, '2026-03-21', 'Ramazan Bayramı (2. gün)'),
  (null, '2026-03-22', 'Ramazan Bayramı (3. gün)'),
  (null, '2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
  (null, '2026-05-01', 'Emek ve Dayanışma Günü'),
  (null, '2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
  (null, '2026-05-27', 'Kurban Bayramı (1. gün)'),
  (null, '2026-05-28', 'Kurban Bayramı (2. gün)'),
  (null, '2026-05-29', 'Kurban Bayramı (3. gün)'),
  (null, '2026-05-30', 'Kurban Bayramı (4. gün)'),
  (null, '2026-07-15', 'Demokrasi ve Milli Birlik Günü'),
  (null, '2026-08-30', 'Zafer Bayramı'),
  (null, '2026-10-29', 'Cumhuriyet Bayramı');

-- ----------------------------------------------------------------------------
-- 3) personel bakiye bileşenleri — hak_gun SAKLANMIYOR (kıdem/yaştan her
--    seferinde hesaplanıyor, bkz. personel_izin_hak_gun_hesapla), sadece
--    türetilemeyen iki değer stored: devir (bir önceki dönemden taşınan) ve
--    duzeltme (elle düzeltme, negatif de olabilir).
-- ----------------------------------------------------------------------------
alter table personel add column izin_devir_gun numeric not null default 0;
alter table personel add column izin_duzeltme_gun numeric not null default 0;

-- ----------------------------------------------------------------------------
-- 4) personel_izin_talebi
-- ----------------------------------------------------------------------------
create table personel_izin_talebi (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  personel_id uuid not null references personel(id) on delete cascade,
  tip text not null check (tip in ('yillik', 'mazeret', 'ucretsiz', 'idari', 'telafi')),
  baslangic_tarih date not null,
  bitis_tarih date not null,
  gun_sayisi numeric not null check (gun_sayisi > 0),
  gerekce text,
  belge_url text,
  durum text not null default 'beklemede' check (durum in ('beklemede', 'onaylandi', 'reddedildi', 'iptal')),
  red_gerekce text,
  degerlendiren_kullanici_id uuid references kullanici(id) on delete set null,
  degerlendirme_tarihi timestamptz,
  iptal_eden_kullanici_id uuid references kullanici(id) on delete set null,
  iptal_tarihi timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personel_izin_talebi_tarih_araligi check (bitis_tarih >= baslangic_tarih),
  constraint personel_izin_talebi_red_gerekce_zorunlu
    check (durum <> 'reddedildi' or (red_gerekce is not null and btrim(red_gerekce) <> ''))
);

create index idx_personel_izin_talebi_klinik_durum on personel_izin_talebi (klinik_id, durum);
create index idx_personel_izin_talebi_personel on personel_izin_talebi (personel_id, durum);
create index idx_personel_izin_talebi_tarih_araligi on personel_izin_talebi (klinik_id, baslangic_tarih, bitis_tarih);

alter table personel_izin_talebi enable row level security;

-- Sadece SELECT — bilinçli olarak INSERT/UPDATE/DELETE policy'si YOK, tüm
-- yazma aşağıdaki 4 RPC üzerinden (SECURITY DEFINER, RLS'i bypass eder).
create policy personel_izin_talebi_select on personel_izin_talebi
  for select
  using (
    (klinik_id = current_klinik_id() and current_rol() = 'klinik_admin')
    or exists (select 1 from personel p where p.id = personel_izin_talebi.personel_id and p.kullanici_id = auth.uid())
    or is_super_admin()
  );

create trigger trg_personel_izin_talebi_klinik_id
  before insert on personel_izin_talebi
  for each row execute function derive_klinik_id_from_parent('personel', 'personel_id');

create trigger trg_personel_izin_talebi_updated_at
  before update on personel_izin_talebi
  for each row execute function set_updated_at();

create trigger trg_personel_izin_talebi_audit
  after insert or update or delete on personel_izin_talebi
  for each row execute function audit_log_yaz();

-- ----------------------------------------------------------------------------
-- 5) personel_puantaj: izin bağlantısı + kaynak genişletmesi
--    (mevcut manuel/tablet/self_qr korunuyor — sadece yeni bir değer ekleniyor,
--    daha önce sadece PLANLANMIŞ olan geniş kaynak-seti değişikliği bu
--    migration'ın kapsamı DIŞINDA, ayrı/onaylanmamış bir görev)
-- ----------------------------------------------------------------------------
alter table personel_puantaj add column izin_talep_id uuid references personel_izin_talebi(id) on delete set null;
create index idx_personel_puantaj_izin_talep_id on personel_puantaj (izin_talep_id) where izin_talep_id is not null;

alter table personel_puantaj drop constraint personel_puantaj_kaynak_check;
alter table personel_puantaj add constraint personel_puantaj_kaynak_check
  check (kaynak = any (array['manuel', 'tablet', 'self_qr', 'izin_talebi']));

-- Eski personel_puantaj_varsayilanlari_doldur() terapist_izin'e (artık yok)
-- bakıyordu — personel_izin_talebi'ne yönlendiriliyor. Eskisinden farklı
-- olarak artık terapist join'i YOK (personel_id doğrudan) — bu, terapist
-- OLMAYAN personelin (klinik_admin/resepsiyon/muhasebe) onaylı izninin asla
-- otomatik "izinli" işaretlenmediği eski bir kapsam eksikliğini de düzeltiyor.
-- "hastalik" dalı kaldırıldı — yeni tip kümesinde (yillik/mazeret/ucretsiz/
-- idari/telafi) rapor/hastalık karşılığı yok, o durum hâlâ admin'in Çalışma
-- Çizelgesi'nden elle 'raporlu' girmesiyle yönetiliyor.
create or replace function personel_puantaj_varsayilanlari_doldur()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_plan record;
  v_mola_varsayilan integer;
  v_izinli boolean;
begin
  if new.planlanan_baslangic is null and new.planlanan_bitis is null then
    select * into v_plan from personel_puantaj_planlanan_getir(new.personel_id, new.tarih);
    if found then
      new.planlanan_baslangic := v_plan.baslangic;
      new.planlanan_bitis := v_plan.bitis;
    end if;
  end if;

  if new.mola_dakika is null then
    select (ayarlar ->> 'varsayilan_mola_dk')::int into v_mola_varsayilan
    from klinik_ayarlar where klinik_id = new.klinik_id;
    new.mola_dakika := coalesce(v_mola_varsayilan, 0);
  end if;

  if new.durum is null then
    select true into v_izinli
    from personel_izin_talebi pit
    where pit.personel_id = new.personel_id
      and pit.durum = 'onaylandi'
      and pit.baslangic_tarih <= new.tarih
      and pit.bitis_tarih >= new.tarih
    limit 1;

    new.durum := case when v_izinli then 'izinli' else 'calisti' end;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Hesaplama fonksiyonları
-- ----------------------------------------------------------------------------

-- Kıdem (ise_giris_tarihi) + yaş (dogum_tarihi, 50+ taban) formülü.
-- 1 yıldan az kıdem: 0 (İş Kanunu m.53 ile tutarlı — kullanıcı görev
-- tarifinde belirtmedi, ["1-5 yıl 14"] aralığının doğal alt sınırı olarak
-- yorumlandı). ise_giris_tarihi hiç girilmemişse asgari 14 gün varsayılır
-- (veri eksikliğinde personeli mağdur etmemek için).
create or replace function personel_izin_hak_gun_hesapla(p_personel_id uuid)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $$
  select case
    when p.ise_giris_tarihi is null then 14
    else greatest(
      case
        when age(current_date, p.ise_giris_tarihi) < interval '1 year' then 0
        when age(current_date, p.ise_giris_tarihi) < interval '5 years' then 14
        when age(current_date, p.ise_giris_tarihi) < interval '15 years' then 20
        else 26
      end,
      case
        when p.dogum_tarihi is not null and age(current_date, p.dogum_tarihi) >= interval '50 years' then 20
        else 0
      end
    )
  end
  from personel p
  where p.id = p_personel_id;
$$;

-- İş günü sayacı: current_klinik_id() üzerinden çalışır (client'tan klinik_id
-- alınmıyor — canlı önizleme için authenticated'a EXECUTE açık, güvenlik
-- current_klinik_id()'nin kendi oturuma bağlı olmasından geliyor). Bir gün
-- "hafta tatili" sayılır eğer klinik o haftanın günü için hiç çalışma saati
-- tanımlamamışsa (klinik.pazar_baslangic/cumartesi_baslangic NULL) — sabit
-- "sadece Pazar" varsayımı yerine kliniğin gerçek çalışma günlerine göre.
create or replace function personel_izin_is_gunu_sayisi(p_baslangic date, p_bitis date)
returns integer
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_klinik klinik%rowtype;
  v_gun date;
  v_sayac integer := 0;
  v_dow integer;
begin
  if p_bitis < p_baslangic then
    raise exception 'tarih_araligi_gecersiz';
  end if;

  select * into v_klinik from klinik where id = v_klinik_id;

  v_gun := p_baslangic;
  while v_gun <= p_bitis loop
    v_dow := extract(dow from v_gun)::int;
    if (v_dow = 0 and v_klinik.pazar_baslangic is null)
       or (v_dow = 6 and v_klinik.cumartesi_baslangic is null) then
      -- hafta tatili, sayılmaz
      null;
    elsif exists (
      select 1 from resmi_tatil rt
      where rt.tarih = v_gun and (rt.klinik_id is null or rt.klinik_id = v_klinik_id)
    ) then
      -- resmi tatil, sayılmaz
      null;
    else
      v_sayac := v_sayac + 1;
    end if;
    v_gun := v_gun + 1;
  end loop;

  return v_sayac;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) v_hasta_ozet deseniyle aynı: security_invoker=true view, RLS alttaki
--    tablolara (personel_izin_talebi SELECT policy'si) bırakılıyor.
--    Bakiyeden SADECE tip='yillik' düşer (kullanıcı kararı) — diğer 4 tip
--    (mazeret/ucretsiz/idari/telafi) bu bakiyeyi hiç etkilemez.
-- ----------------------------------------------------------------------------
create view v_personel_izin_bakiye
with (security_invoker = true) as
select
  p.id as personel_id,
  p.klinik_id,
  personel_izin_hak_gun_hesapla(p.id) as hak_gun,
  p.izin_devir_gun as devir_gun,
  p.izin_duzeltme_gun as duzeltme_gun,
  coalesce((
    select sum(t.gun_sayisi) from personel_izin_talebi t
    where t.personel_id = p.id and t.tip = 'yillik' and t.durum = 'onaylandi'
  ), 0) as onaylanan_gun,
  coalesce((
    select sum(t.gun_sayisi) from personel_izin_talebi t
    where t.personel_id = p.id and t.tip = 'yillik' and t.durum = 'beklemede'
  ), 0) as beklemede_gun,
  personel_izin_hak_gun_hesapla(p.id) + p.izin_devir_gun + p.izin_duzeltme_gun
    - coalesce((
        select sum(t.gun_sayisi) from personel_izin_talebi t
        where t.personel_id = p.id and t.tip = 'yillik' and t.durum = 'onaylandi'
      ), 0)
    - coalesce((
        select sum(t.gun_sayisi) from personel_izin_talebi t
        where t.personel_id = p.id and t.tip = 'yillik' and t.durum = 'beklemede'
      ), 0) as kalan_gun
from personel p;

-- ----------------------------------------------------------------------------
-- 8) Çakışma tespiti — "aynı tarihlerde izinli olan diğer personel". Sadece
--    onaylı (kesinleşmiş) izinler çakışma sayılır, beklemedekiler değil.
-- ----------------------------------------------------------------------------
create or replace function personel_izin_cakisanlari_getir(p_talep_id uuid)
returns table (
  personel_id uuid,
  ad_soyad text,
  baslangic_tarih date,
  bitis_tarih date
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select p.id, p.ad_soyad, t.baslangic_tarih, t.bitis_tarih
  from personel_izin_talebi hedef
  join personel_izin_talebi t
    on t.klinik_id = hedef.klinik_id
   and t.id <> hedef.id
   and t.personel_id <> hedef.personel_id
   and t.durum = 'onaylandi'
   and t.baslangic_tarih <= hedef.bitis_tarih
   and t.bitis_tarih >= hedef.baslangic_tarih
  join personel p on p.id = t.personel_id
  where hedef.id = p_talep_id
    and (hedef.klinik_id = current_klinik_id() or is_super_admin())
  order by t.baslangic_tarih;
$$;

-- ----------------------------------------------------------------------------
-- 9) Durum geçişi RPC'leri — TEK yazma yolu.
-- ----------------------------------------------------------------------------

-- beklemede oluşturma: klinik_admin (herhangi bir personel adına) veya
-- personelin kendisi.
create or replace function personel_izin_talep_olustur(
  p_personel_id uuid,
  p_tip text,
  p_baslangic_tarih date,
  p_bitis_tarih date,
  p_gerekce text default null,
  p_belge_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_personel personel%rowtype;
  v_klinik_id uuid := current_klinik_id();
  v_gun_sayisi numeric;
  v_yeni_id uuid;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found or (v_personel.klinik_id <> v_klinik_id and not is_super_admin()) then
    raise exception 'personel_bulunamadi';
  end if;

  if not coalesce(
    current_rol() = 'klinik_admin'
    or v_personel.kullanici_id = auth.uid()
    or is_super_admin(),
    false
  ) then
    raise exception 'yetkisiz';
  end if;

  if p_tip not in ('yillik', 'mazeret', 'ucretsiz', 'idari', 'telafi') then
    raise exception 'tip_gecersiz';
  end if;

  if p_bitis_tarih < p_baslangic_tarih then
    raise exception 'tarih_araligi_gecersiz';
  end if;

  v_gun_sayisi := personel_izin_is_gunu_sayisi(p_baslangic_tarih, p_bitis_tarih);
  if v_gun_sayisi <= 0 then
    raise exception 'gun_sayisi_sifir';
  end if;

  insert into personel_izin_talebi (
    klinik_id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url
  ) values (
    v_klinik_id, p_personel_id, p_tip, p_baslangic_tarih, p_bitis_tarih, v_gun_sayisi, p_gerekce, p_belge_url
  )
  returning id into v_yeni_id;

  return v_yeni_id;
end;
$$;

-- beklemede -> iptal: SADECE talebin sahibi personel (yönetici "Reddet"i kullanır).
create or replace function personel_izin_talep_iptal_et(p_talep_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_talep personel_izin_talebi%rowtype;
  v_personel personel%rowtype;
begin
  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found then
    raise exception 'talep_bulunamadi';
  end if;

  select * into v_personel from personel where id = v_talep.personel_id;

  if not coalesce(v_personel.kullanici_id = auth.uid() or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  update personel_izin_talebi
  set durum = 'iptal', iptal_eden_kullanici_id = auth.uid(), iptal_tarihi = now()
  where id = p_talep_id;
end;
$$;

-- beklemede -> onaylandi: sadece klinik_admin. İlgili günlere personel_puantaj
-- yazar (durum='izinli', kaynak='izin_talebi'). Kapalı bir puantaj dönemine
-- denk gelen HERHANGİ bir gün varsa TÜM onay reddedilir (net hata, hangi ay).
create or replace function personel_izin_talebi_onayla(p_talep_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_talep personel_izin_talebi%rowtype;
  v_klinik klinik%rowtype;
  v_gun date;
  v_dow integer;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  -- 1. geçiş: kapalı dönem var mı kontrol et, HİÇBİR ŞEY YAZMADAN önce.
  v_gun := v_talep.baslangic_tarih;
  while v_gun <= v_talep.bitis_tarih loop
    if not personel_puantaj_donemi_acik_mi(v_talep.personel_id, v_gun) then
      raise exception 'donem_kapali: %', to_char(v_gun, 'YYYY-MM');
    end if;
    v_gun := v_gun + 1;
  end loop;

  select * into v_klinik from klinik where id = v_talep.klinik_id;

  -- 2. geçiş: sadece sayılan iş günlerine (hafta tatili/resmi tatil hariç) yaz.
  v_gun := v_talep.baslangic_tarih;
  while v_gun <= v_talep.bitis_tarih loop
    v_dow := extract(dow from v_gun)::int;
    if (v_dow = 0 and v_klinik.pazar_baslangic is null)
       or (v_dow = 6 and v_klinik.cumartesi_baslangic is null)
       or exists (
         select 1 from resmi_tatil rt
         where rt.tarih = v_gun and (rt.klinik_id is null or rt.klinik_id = v_talep.klinik_id)
       ) then
      null; -- sayılmayan gün, puantaj satırı yazılmaz
    else
      insert into personel_puantaj (personel_id, tarih, durum, kaynak, izin_talep_id, mola_dakika)
      values (v_talep.personel_id, v_gun, 'izinli', 'izin_talebi', p_talep_id, 0)
      on conflict (personel_id, tarih) do update set
        durum = 'izinli',
        kaynak = 'izin_talebi',
        izin_talep_id = excluded.izin_talep_id,
        giris_saat = null,
        cikis_saat = null;
    end if;
    v_gun := v_gun + 1;
  end loop;

  update personel_izin_talebi
  set durum = 'onaylandi', degerlendiren_kullanici_id = auth.uid(), degerlendirme_tarihi = now()
  where id = p_talep_id;
end;
$$;

-- beklemede -> reddedildi: sadece klinik_admin, gerekçe zorunlu.
create or replace function personel_izin_talebi_reddet(p_talep_id uuid, p_red_gerekce text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_talep personel_izin_talebi%rowtype;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  if p_red_gerekce is null or btrim(p_red_gerekce) = '' then
    raise exception 'red_gerekce_zorunlu';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  update personel_izin_talebi
  set durum = 'reddedildi', red_gerekce = p_red_gerekce,
      degerlendiren_kullanici_id = auth.uid(), degerlendirme_tarihi = now()
  where id = p_talep_id;
end;
$$;

-- onaylandi -> iptal: SADECE klinik_admin, SADECE izin henüz başlamadıysa.
-- Otomatik yazılmış personel_puantaj satırlarını geri alır (silme, geri
-- yazma değil — o günler artık "izinli" değil, sanki hiç onaylanmamış gibi).
create or replace function personel_izin_talebi_yonetici_iptal(p_talep_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_talep personel_izin_talebi%rowtype;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'onaylandi' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  if v_talep.baslangic_tarih <= current_date then
    raise exception 'izin_baslamis';
  end if;

  delete from personel_puantaj where izin_talep_id = p_talep_id;

  update personel_izin_talebi
  set durum = 'iptal', iptal_eden_kullanici_id = auth.uid(), iptal_tarihi = now()
  where id = p_talep_id;
end;
$$;

commit;
