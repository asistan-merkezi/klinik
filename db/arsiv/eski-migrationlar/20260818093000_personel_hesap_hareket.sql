-- Ödemeler sekmesi: maaş/hakediş/avans → tek cari defter (personel_hesap_hareket)
-- ============================================================================
-- personel_ekstra_hakedis (yol/yemek/mesai/avans/diger) VE personel_odeme
-- (fiilen ödenen) TAMAMEN KALDIRILIYOR — ikisi de canlıda 0 satır (teyitli),
-- veri taşımaya gerek yok. personel_maas_gecmisi RENAME ediliyor (personel_ucret)
-- — zaten append-only'ydi, sadece isim/terminoloji netleşiyor ("tek cari
-- defter" felsefesiyle tutarlı: ücret de kendi mini-defterinde).
--
-- personel_izin_talebi'yle AYNI mimari karar: personel_hesap_hareket'te hiç
-- doğrudan INSERT/UPDATE/DELETE RLS policy'si YOK, sadece SELECT — tüm yazma
-- 2 RPC üzerinden (manuel ekleme + dönem-kapanışı otomatik ekleme).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) personel_maas_gecmisi -> personel_ucret (rename, davranış aynı)
-- ----------------------------------------------------------------------------
alter table personel_maas_gecmisi rename to personel_ucret;
alter index personel_maas_gecmisi_pkey rename to personel_ucret_pkey;
alter index idx_personel_maas_gecmisi_klinik_id rename to idx_personel_ucret_klinik_id;
alter index idx_personel_maas_gecmisi_personel_id rename to idx_personel_ucret_personel_id;
alter index idx_personel_maas_gecmisi_gecerlilik_tarihi rename to idx_personel_ucret_gecerlilik_tarihi;

-- Not: pkey'in constraint adı = backing index adı olduğu için yukarıdaki
-- "ALTER INDEX ... RENAME" zaten pkey constraint'ini de yeniden adlandırdı;
-- burada AYRICA "RENAME CONSTRAINT ... pkey" çağırmak "artık yok" hatası
-- verir (aynı obje iki kez adlandırılmaya çalışılıyor).
alter table personel_ucret rename constraint personel_maas_gecmisi_klinik_id_fkey to personel_ucret_klinik_id_fkey;
alter table personel_ucret rename constraint personel_maas_gecmisi_personel_id_fkey to personel_ucret_personel_id_fkey;
alter table personel_ucret rename constraint personel_maas_gecmisi_ekleyen_kullanici_id_fkey to personel_ucret_ekleyen_kullanici_id_fkey;
alter table personel_ucret rename constraint personel_maas_gecmisi_maas_check to personel_ucret_maas_check;

drop policy if exists personel_maas_gecmisi_select on personel_ucret;
drop policy if exists personel_maas_gecmisi_yonet_admin on personel_ucret;

create policy personel_ucret_select on personel_ucret
  for select
  using (
    (klinik_id = current_klinik_id() and current_rol() = 'klinik_admin')
    or exists (select 1 from personel p where p.id = personel_ucret.personel_id and p.kullanici_id = auth.uid())
    or is_super_admin()
  );

create policy personel_ucret_yonet_admin on personel_ucret
  for all
  using ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin())
  with check ((klinik_id = current_klinik_id() and current_rol() = 'klinik_admin') or is_super_admin());

-- ----------------------------------------------------------------------------
-- 2) Eski ekstra hakediş / ödeme tabloları — 0 satır, veri taşınmıyor
-- ----------------------------------------------------------------------------
drop table if exists personel_ekstra_hakedis;
drop table if exists personel_odeme;

-- ----------------------------------------------------------------------------
-- 3) personel_hesap_hareket — tek cari defter
--    + turler (hakedis/prim/yol/yemek/mesai): personelin klinikten alacağını
--      ARTIRIR. − turler (avans/kesinti/odeme): AZALTIR (borç kapatma amaçlı).
--    tutar HER ZAMAN pozitif saklanıyor — yön `tur`den türetiliyor (bkz.
--    v_personel_hesap_bakiye), "-500 girdim" gibi kullanıcı hatalarına kapalı.
-- ----------------------------------------------------------------------------
create table personel_hesap_hareket (
  id uuid primary key default gen_random_uuid(),
  klinik_id uuid not null references klinik(id) on delete cascade,
  personel_id uuid not null references personel(id) on delete cascade,
  tur text not null check (tur in ('hakedis', 'prim', 'yol', 'yemek', 'mesai', 'avans', 'kesinti', 'odeme')),
  -- >=0 (>0 değil): dönem kapanışında fm_saatlik_ucret hiç tanımlı değilse
  -- 'mesai' satırı bilinçli olarak 0 TL yazılıyor ("saat onaylandı ama ücret
  -- tanımsız, elle düzeltilmeli" — eski personel_ekstra_hakedis'teki davranış
  -- aynen korundu). Manuel ekleme RPC'si (personel_hesap_hareket_ekle) ayrıca
  -- >0 zorunlu kılıyor — 0 sadece otomatik/sistem satırlarında görülebilir.
  tutar numeric not null check (tutar >= 0),
  tarih date not null default current_date,
  aciklama text,
  kaynak_id uuid references personel_puantaj_donem(id) on delete set null,
  ekleyen_kullanici_id uuid references kullanici(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Hakediş satırı SADECE dönem kapanışında otomatik üretilir" — kaynak_id
  -- dolu olmayan bir 'hakedis' satırı asla var olamaz (elle giriş RPC'si zaten
  -- tur='hakedis'i reddediyor, bu CHECK ikinci savunma katmanı).
  constraint personel_hesap_hareket_hakedis_kaynakli check (tur <> 'hakedis' or kaynak_id is not null)
);

create index idx_personel_hesap_hareket_klinik_id on personel_hesap_hareket (klinik_id);
create index idx_personel_hesap_hareket_personel_tarih on personel_hesap_hareket (personel_id, tarih);
create index idx_personel_hesap_hareket_kaynak_id on personel_hesap_hareket (kaynak_id) where kaynak_id is not null;

alter table personel_hesap_hareket enable row level security;

create policy personel_hesap_hareket_select on personel_hesap_hareket
  for select
  using (
    (klinik_id = current_klinik_id() and current_rol() in ('klinik_admin', 'muhasebe'))
    or exists (select 1 from personel p where p.id = personel_hesap_hareket.personel_id and p.kullanici_id = auth.uid())
    or is_super_admin()
  );

create trigger trg_personel_hesap_hareket_klinik_id
  before insert on personel_hesap_hareket
  for each row execute function derive_klinik_id_from_parent('personel', 'personel_id');

create trigger trg_personel_hesap_hareket_updated_at
  before update on personel_hesap_hareket
  for each row execute function set_updated_at();

create trigger trg_personel_hesap_hareket_audit
  after insert or update or delete on personel_hesap_hareket
  for each row execute function audit_log_yaz();

-- ----------------------------------------------------------------------------
-- 4) Manuel hareket ekleme — 'hakedis' HARİÇ tüm türler. klinik_admin-only
--    (personel_ekstra_hakedis/personel_odeme'nin ikisi de zaten admin-only'di).
-- ----------------------------------------------------------------------------
create or replace function personel_hesap_hareket_ekle(
  p_personel_id uuid,
  p_tur text,
  p_tutar numeric,
  p_tarih date default current_date,
  p_aciklama text default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_personel personel%rowtype;
  v_yeni_id uuid;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  if p_tur = 'hakedis' then
    raise exception 'hakedis_elle_eklenemez';
  end if;

  if p_tur not in ('prim', 'yol', 'yemek', 'mesai', 'avans', 'kesinti', 'odeme') then
    raise exception 'tur_gecersiz';
  end if;

  if p_tutar <= 0 then
    raise exception 'tutar_gecersiz';
  end if;

  select * into v_personel from personel where id = p_personel_id;
  if not found or (v_personel.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'personel_bulunamadi';
  end if;

  insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, ekleyen_kullanici_id)
  values (v_personel.klinik_id, p_personel_id, p_tur, p_tutar, p_tarih, p_aciklama, auth.uid())
  returning id into v_yeni_id;

  return v_yeni_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Dönem kapanışında otomatik 'hakedis' (+varsa 'prim') satırı — TEK yol.
--    Taban/prim tutarları TS tarafındaki maasHesapla()'dan (tek kaynak,
--    formülü SQL'de tekrar YAZMIYORUZ) hesaplanıp parametre olarak geliyor;
--    bu fonksiyon sadece yetki+idempotency+kayıt sorumluluğu taşıyor.
-- ----------------------------------------------------------------------------
create or replace function personel_hesap_hareket_donem_ekle(
  p_donem_id uuid,
  p_hakedis_tutar numeric,
  p_prim_tutar numeric default 0
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_donem personel_puantaj_donem%rowtype;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  select * into v_donem from personel_puantaj_donem where id = p_donem_id;
  if not found or (v_donem.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'donem_bulunamadi';
  end if;

  if exists (select 1 from personel_hesap_hareket where kaynak_id = p_donem_id and tur = 'hakedis') then
    raise exception 'zaten_islendi';
  end if;

  if p_hakedis_tutar < 0 then
    raise exception 'tutar_gecersiz';
  end if;

  -- Tutar 0 olsa bile (maas tanımsız/0) satır yazılır — hem "bu dönem işlendi"
  -- idempotency imzası hem de eksik ücret tanımının görünür kalması için.
  insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
  values (
    v_donem.klinik_id, v_donem.personel_id, 'hakedis', p_hakedis_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
    format('%s/%s dönemi taban hakediş', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
  );

  if p_prim_tutar > 0 then
    insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
    values (
      v_donem.klinik_id, v_donem.personel_id, 'prim', p_prim_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
      format('%s/%s dönemi prim', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
    );
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) personel_puantaj_donem_kapat: 'mesai' hakediş hedefi personel_ekstra_
--    hakedis'ten personel_hesap_hareket'e taşındı — geri kalan mantık (net/fm/
--    izin/devamsızlık snapshot) DEĞİŞMEDİ, aynen kopyalandı.
-- ----------------------------------------------------------------------------
create or replace function personel_puantaj_donem_kapat(p_personel_id uuid, p_yil integer, p_ay integer)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
DECLARE
  v_klinik_id uuid;
  v_personel personel%ROWTYPE;
  v_ay_baslangic date;
  v_ay_bitis date;
  v_net_dk numeric;
  v_fm_dk numeric;
  v_eksik_dk numeric;
  v_izin_gun integer;
  v_devamsizlik_gun integer;
  v_donem_id uuid;
  v_fm_saat numeric;
  v_hakedis_tutar numeric;
BEGIN
  v_klinik_id := current_klinik_id();
  IF NOT COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id AND (klinik_id = v_klinik_id OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  IF EXISTS (
    SELECT 1 FROM personel_puantaj_donem
    WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay AND durum = 'kapali'
  ) THEN
    RAISE EXCEPTION 'donem_zaten_kapali';
  END IF;

  v_ay_baslangic := make_date(p_yil, p_ay, 1);
  v_ay_bitis := (v_ay_baslangic + interval '1 month')::date;

  SELECT
    COALESCE(SUM(net_calisma_dakika), 0),
    COALESCE(SUM(fazla_mesai_dakika) FILTER (WHERE fm_onay_durumu = 'onaylandi'), 0),
    COALESCE(SUM(eksik_calisma_dakika), 0),
    COUNT(*) FILTER (WHERE durum IN ('izinli', 'raporlu')),
    COUNT(*) FILTER (WHERE durum = 'gelmedi')
  INTO v_net_dk, v_fm_dk, v_eksik_dk, v_izin_gun, v_devamsizlik_gun
  FROM personel_puantaj
  WHERE personel_id = p_personel_id AND tarih >= v_ay_baslangic AND tarih < v_ay_bitis;

  INSERT INTO personel_puantaj_donem (
    klinik_id, personel_id, yil, ay, durum,
    snapshot_net_saat, snapshot_onayli_fm_saat, snapshot_eksik_saat,
    snapshot_izin_gun, snapshot_devamsizlik_gun, kapatan_id, kapatma_tarihi
  ) VALUES (
    v_klinik_id, p_personel_id, p_yil, p_ay, 'kapali',
    round(v_net_dk / 60.0, 2), round(v_fm_dk / 60.0, 2), round(v_eksik_dk / 60.0, 2),
    v_izin_gun, v_devamsizlik_gun, auth.uid(), now()
  )
  ON CONFLICT (personel_id, yil, ay) DO UPDATE SET
    durum = 'kapali',
    snapshot_net_saat = EXCLUDED.snapshot_net_saat,
    snapshot_onayli_fm_saat = EXCLUDED.snapshot_onayli_fm_saat,
    snapshot_eksik_saat = EXCLUDED.snapshot_eksik_saat,
    snapshot_izin_gun = EXCLUDED.snapshot_izin_gun,
    snapshot_devamsizlik_gun = EXCLUDED.snapshot_devamsizlik_gun,
    kapatan_id = EXCLUDED.kapatan_id,
    kapatma_tarihi = EXCLUDED.kapatma_tarihi
  RETURNING id INTO v_donem_id;

  v_fm_saat := round(v_fm_dk / 60.0, 2);

  IF v_fm_saat > 0 AND NOT EXISTS (
    SELECT 1 FROM personel_hesap_hareket WHERE kaynak_id = v_donem_id AND tur = 'mesai'
  ) THEN
    v_hakedis_tutar := COALESCE(v_personel.fm_saatlik_ucret, 0) * v_fm_saat;

    INSERT INTO personel_hesap_hareket (
      klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id
    ) VALUES (
      v_klinik_id, p_personel_id, 'mesai', GREATEST(v_hakedis_tutar, 0.01), (v_ay_bitis - 1),
      format(
        '%s/%s dönemi onaylı fazla mesai: %s sa%s', p_ay, p_yil, v_fm_saat,
        CASE WHEN v_personel.fm_saatlik_ucret IS NULL
          THEN ' — saatlik ücret tanımlı değil, tutar elle güncellenmeli'
          ELSE '' END
      ),
      v_donem_id, auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'donem_id', v_donem_id,
    'net_saat', round(v_net_dk / 60.0, 2),
    'onayli_fm_saat', v_fm_saat,
    'eksik_saat', round(v_eksik_dk / 60.0, 2),
    'izin_gun', v_izin_gun,
    'devamsizlik_gun', v_devamsizlik_gun
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7) Bakiye view'ı — v_personel_izin_bakiye'yle aynı desen.
-- ----------------------------------------------------------------------------
create view v_personel_hesap_bakiye
with (security_invoker = true) as
select
  p.id as personel_id,
  p.klinik_id,
  coalesce((
    select sum(h.tutar) from personel_hesap_hareket h
    where h.personel_id = p.id and h.tur in ('hakedis', 'prim', 'yol', 'yemek', 'mesai')
  ), 0) as toplam_hakedis,
  coalesce((
    select sum(h.tutar) from personel_hesap_hareket h
    where h.personel_id = p.id and h.tur in ('avans', 'kesinti', 'odeme')
  ), 0) as toplam_odenen,
  coalesce((
    select sum(h.tutar) from personel_hesap_hareket h
    where h.personel_id = p.id and h.tur in ('hakedis', 'prim', 'yol', 'yemek', 'mesai')
  ), 0) - coalesce((
    select sum(h.tutar) from personel_hesap_hareket h
    where h.personel_id = p.id and h.tur in ('avans', 'kesinti', 'odeme')
  ), 0) as bakiye
from personel p;

commit;
