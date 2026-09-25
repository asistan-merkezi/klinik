-- Kod incelemesi bulgusu: Kasa/Banka sayfaları (kasa/page.tsx, banka/page.tsx)
-- her sayfa yüklemesinde kliniğin TÜM ömür boyu hareket geçmişini (hasta
-- ödemesi + harcama + personel ödemesi + nakit_banka_hareketi) tarih filtresi
-- olmadan indirip client'ta netleştiriyordu — klinik yaşlandıkça bu sayfa
-- yükleme başına sürekli büyüyen bir sorgu/transfer/render maliyeti demek.
--
-- Bu iki RPC, sayfaların artık yalnızca SEÇİLİ YILIN detayını çekmesine (bkz.
-- ilgili page.tsx'lerdeki ?yil= parametresi) izin veriyor — "dönem başı
-- bakiye" (seçili yıldan ÖNCEKİ tüm tarihin net toplamı) artık tüm eski
-- satırları indirip JS'te toplamak yerine Postgres'te tek bir SUM ile
-- hesaplanıyor. Tam arşiv korunuyor (herhangi bir yıla gidilebilir), sadece
-- o yılın ÖNCESİ artık satır satır değil, tek sayı olarak taşınıyor.
--
-- current_klinik_id() içeriden çözülür, client'tan klinik_id ALINMAZ
-- (personel_izin_is_gunu_sayisi'yle aynı desen). Kasa/Banka'yı zaten
-- görebilen roller (klinik_admin, muhasebe, super_admin) dışında kimse
-- çağıramaz — sayfa katmanındaki "yetkili" kontrolünün RPC'de tekrarı, aksi
-- halde herhangi bir authenticated rol (örn. terapist) doğrudan RPC'yi
-- çağırıp kliniğin kasa/banka toplamını görebilirdi.

create or replace function kasa_bakiye_once_toplam(p_once_tarih date)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := p_once_tarih::timestamptz;
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts;

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'nakit' and g.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(p.tutar) from personel_hesap_hareket p
    where p.klinik_id = v_klinik_id and p.odeme_tipi = 'nakit' and p.tur in ('odeme', 'avans') and p.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam + coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.hedef_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.kaynak_kasa = true and n.tarih < p_once_tarih
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
        and h.banka_hesap_id = b.id and h.created_at < p_once_tarih::timestamptz
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

-- Kredi Kartı sayfası (kredi-karti/page.tsx) da aynı "tüm ömür boyu geçmişi
-- sınırsız çeker" desenini taşıyordu — aynı pencereleme burada da uygulanıyor.
-- Manuel hareket tablosu (nakit_banka_hareketi) kredi kartı bacağı taşımadığı
-- için sadece hasta ödemesi (gelen) ve klinik_harcama (giden) toplanıyor.
create or replace function kredi_karti_bakiye_once_toplam(p_once_tarih date)
returns numeric
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti' and h.created_at < p_once_tarih::timestamptz;

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'kredi_karti' and g.tarih < p_once_tarih
  ), 0);

  return v_toplam;
end;
$$;

-- Kontrol:
-- SELECT kasa_bakiye_once_toplam('2026-01-01'); -- authenticated klinik_admin/muhasebe oturumunda
-- SELECT * FROM banka_bakiye_once_toplam_tumu('2026-01-01');
-- SET LOCAL role authenticated; SELECT set_config('request.jwt.claims', '{"sub":"<terapist-user-id>"}', true);
-- SELECT kasa_bakiye_once_toplam('2026-01-01'); -- 'yetkisiz' hatası beklenir
