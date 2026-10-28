-- Hasta iadesi (tur='iade') akışı: iade artık (1) hastanın cari bakiyesini
-- düşürür ve (2) ödeme yöntemine göre Kasa / Banka / Kredi Kartı mutabakatında
-- ÇIKIŞ olarak sayılır.
--
-- Önceki durum: hiçbir UI iade satırı üretmiyordu (tek giriş formu tur'u
-- 'odeme' olarak sabit gönderiyordu), v_hasta_ozet 'iade'yi ELSE 0 dalına
-- düşürüyordu ve Kasa/Banka/Kredi Kartı yalnız tur='odeme' topluyordu — yani
-- iade yazılsaydı ne bakiyeye ne kasaya yansıyacaktı.
--
-- Bakiye kuralı (lib/hasta/bakiye-hareket-gorunum.ts ile AYNI olmalı):
--   kredi                              → +tutar
--   borc                               → -(tutar - iskonto_tutari)
--   odeme, odeme_id NULL (Ödeme Ekle)  → +tutar
--   iade,  odeme_id NULL (İade Ver)    → -tutar   ← YENİ
--   diğer                              → 0
--
-- Fonksiyonlarda imza DEĞİŞMİYOR (yalnız gövde) — CREATE OR REPLACE aynı
-- imzayı değiştirir, ikinci bir overload yaratmaz (bkz. CLAUDE.md > PGRST203).
-- İdempotent.

-- ==================== v_hasta_ozet: iade bakiyeyi düşürür ====================
-- Kolon listesi 20260814100000_paket_satis_bitis_tarihi.sql'deki güncel
-- tanımla birebir aynı (CREATE OR REPLACE VIEW kolon eklemeye/çıkarmaya izin vermez).
CREATE OR REPLACE VIEW v_hasta_ozet WITH (security_invoker = true) AS
 SELECT m.id AS hasta_id,
    m.klinik_id,
    vas.son_skor AS son_vas_skoru,
    vas.son_tarih AS son_vas_tarihi,
    COALESCE(hedef.aktif_hedef_sayisi, 0::bigint) AS aktif_hedef_sayisi,
    COALESCE(paket.kalan_paket_hakki, 0::bigint) AS kalan_paket_hakki,
    COALESCE(bakiye.bakiye, 0::numeric) AS bakiye,
    seans.son_seans_tarihi,
    jsonb_array_length(COALESCE(m.risk_bayraklari, '[]'::jsonb)) AS aktif_risk_bayrak_sayisi,
    COALESCE(noshow.no_show_sayisi, 0::bigint) AS no_show_sayisi
   FROM hasta m
     LEFT JOIN LATERAL ( SELECT mo.hesaplanan_skor AS son_skor,
            mo.olcum_tarihi AS son_tarih
           FROM hasta_olcum mo
             JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id
          WHERE mo.hasta_id = m.id AND ot.kod = 'VAS'::text
          ORDER BY mo.olcum_tarihi DESC
         LIMIT 1) vas ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS aktif_hedef_sayisi
           FROM hasta_hedef mh
          WHERE mh.hasta_id = m.id AND mh.durum = 'aktif'::text) hedef ON true
     LEFT JOIN LATERAL ( SELECT sum(ps.kalan_adet) AS kalan_paket_hakki
           FROM paket_satis ps
          WHERE ps.hasta_id = m.id AND ps.durum = 'aktif'::text) paket ON true
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN mb.tur = 'kredi'::text THEN mb.tutar
                    WHEN mb.tur = 'borc'::text THEN - (mb.tutar - mb.iskonto_tutari)
                    WHEN mb.tur = 'odeme'::text AND mb.odeme_id IS NULL THEN mb.tutar
                    WHEN mb.tur = 'iade'::text AND mb.odeme_id IS NULL THEN - mb.tutar
                    ELSE 0::numeric
                END) AS bakiye
           FROM hasta_bakiye_hareket mb
          WHERE mb.hasta_id = m.id) bakiye ON true
     LEFT JOIN LATERAL ( SELECT max(r.baslangic) AS son_seans_tarihi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'geldi'::randevu_durum_tipi) seans ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS no_show_sayisi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'gelmedi'::randevu_durum_tipi) noshow ON true;

-- ==================== İade satırında ödeme yöntemi zorunlu ====================
-- Yalnız YENİ/güncellenen satırlar için (NOT VALID) — mevcut veriyi taramaz.
-- banka_havalesi'nde banka_hesap_id zorunluluğu bilinçli olarak CHECK'te DEĞİL,
-- action katmanında: kolon ON DELETE SET NULL, CHECK'e koysak banka hesabı
-- silinirken FK'nin yaptığı UPDATE bu kısıta takılıp silmeyi engellerdi.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hasta_bakiye_hareket_iade_yontem_zorunlu'
      AND conrelid = 'hasta_bakiye_hareket'::regclass
  ) THEN
    ALTER TABLE hasta_bakiye_hareket
      ADD CONSTRAINT hasta_bakiye_hareket_iade_yontem_zorunlu
      CHECK (tur <> 'iade' OR odeme_yontemi IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- ==================== Kasa / Banka / Kredi Kartı: dönem başı toplamlarında iade çıkış ====================
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
      select sum(h.tutar) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'banka_havalesi'
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
    select sum(h.tutar) from hasta_bakiye_hareket h
    where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'kredi_karti' and h.created_at < p_once_tarih::timestamptz
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'kredi_karti' and g.tarih < p_once_tarih
  ), 0);

  return v_toplam;
end;
$$;

-- Kontrol:
-- SELECT pg_get_viewdef('v_hasta_ozet'::regclass) LIKE '%iade%';  -- true beklenir
-- SELECT proname, pronargs FROM pg_proc WHERE proname IN ('kasa_bakiye_once_toplam','banka_bakiye_once_toplam_tumu','kredi_karti_bakiye_once_toplam'); -- her biri TEK satır (overload yok)
-- Rollback'li uçtan uca test: bir hastaya nakit ödeme + nakit iade ekle → v_hasta_ozet.bakiye = ödeme - iade,
-- kasa_bakiye_once_toplam(yarın) iade kadar düşük çıkmalı.
