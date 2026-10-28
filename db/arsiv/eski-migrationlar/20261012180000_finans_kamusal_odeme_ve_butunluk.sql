-- Finans denetimi (2026-10-12).
--
-- 1) Kamusal ödemeler (vergi/SGK/MTV...) hiçbir Kasa/Banka defterinde ÇIKIŞ olarak görünmüyordu —
--    tabloda ödeme yöntemi/banka hesabı yoktu. Yıllar içinde ödenen tüm vergi ve primler kadar Kasa/Banka
--    bakiyesi şişkin görünüyordu. Artık ödenen (odeme_tarihi dolu) kamusal ödeme için yöntem seçilir:
--    nakit → Kasa çıkışı, havale → seçilen banka hesabından çıkış (odeme_tarihi gününde).
--    Daha önce ödenmiş kayıtların yöntemi BOŞ kalır ve hiçbir deftere girmez (eskisi gibi);
--    Kamusal Giderler'de "ödeme bilgisi eksik" olarak görünür, düzenlenip yöntem seçilince deftere düşer.
--    Kasa/Banka sayfaları ve aşağıdaki iki RPC aynı kaynakları okur — BİRLİKTE değişir.
-- 2) nakit_banka_hareketi'nde banka hesaplarının aynı kliniğe ait olduğu doğrulanmıyordu; "hesaplar
--    arası transferde kaynak ≠ hedef" CHECK'i mantık hatası yüzünden aynı banka hesabından kendisine
--    transferi kabul ediyordu (OR yerine AND olmalıydı).
-- 3) hasta_bakiye_hareket_borc_duzenle: faturalanmış bir borcun iskontosu "faturalı" işaretlenmeden
--    değiştirilince borç değişiyor ama fatura tutarı DEĞİŞMİYORDU; işaretlenerek değiştirilince de
--    KESİLMİŞ (gönderilmiş) faturanın tutarı sessizce değişiyordu. Tam iskontolu (net 0) borç
--    faturalanmak istenince odeme_satiri CHECK'i anlaşılmaz bir hata veriyordu.

-- ---------------------------------------------------------------------------
-- 1a) kamusal_odeme: ödeme yöntemi + banka hesabı
-- ---------------------------------------------------------------------------
ALTER TABLE kamusal_odeme
  ADD COLUMN IF NOT EXISTS odeme_yontemi text CHECK (odeme_yontemi IN ('nakit', 'havale')),
  ADD COLUMN IF NOT EXISTS banka_hesap_id uuid REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kamusal_odeme_banka_hesap
  ON kamusal_odeme (banka_hesap_id) WHERE banka_hesap_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_zzz_banka_hesabi_butunluk ON kamusal_odeme;
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk
  BEFORE INSERT OR UPDATE ON kamusal_odeme
  FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_yontemi', 'havale', 'banka_hesap_id');

-- Bağlı kaydı olan banka hesabı silinemez — kamusal ödemeler de artık bağlı kayıt.
CREATE OR REPLACE FUNCTION banka_hesabi_silme_engeli()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM hasta_bakiye_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_harcama WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM personel_hesap_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_cari_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_kredi_karti_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM kamusal_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM nakit_banka_hareketi
       WHERE kaynak_banka_hesap_id = OLD.id OR hedef_banka_hesap_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'banka_hesabi_kullaniliyor' USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1b) Kasa dönem başı bakiyesi (+ nakit kamusal ödeme çıkışı)
-- ---------------------------------------------------------------------------
create or replace function kasa_bakiye_once_toplam(p_once_tarih date)
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
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts;

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

  v_toplam := v_toplam + coalesce((
    select sum(d.tutar) from kasa_dengeleme d
    where d.klinik_id = v_klinik_id and d.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(c.tutar) from klinik_cari_odeme c
    where c.klinik_id = v_klinik_id and c.odeme_tipi = 'nakit' and c.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(k.tutar) from klinik_kredi_karti_odeme k
    where k.klinik_id = v_klinik_id and k.odeme_tipi = 'nakit' and k.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(ko.tutar) from kamusal_odeme ko
    where ko.klinik_id = v_klinik_id and ko.odeme_yontemi = 'nakit'
      and ko.odeme_tarihi is not null and ko.odeme_tarihi < p_once_tarih
  ), 0);

  return v_toplam;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1c) Banka dönem başı bakiyesi (+ havale kamusal ödeme çıkışı)
-- ---------------------------------------------------------------------------
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
    + coalesce((
      select sum(h.tutar - round(h.tutar * coalesce(h.komisyon_orani, 0) / 100, 2)) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti'
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
    - coalesce((
      select sum(c.tutar) from klinik_cari_odeme c
      where c.klinik_id = v_klinik_id and c.odeme_tipi = 'havale' and c.banka_hesap_id = b.id and c.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(k.tutar) from klinik_kredi_karti_odeme k
      where k.klinik_id = v_klinik_id and k.odeme_tipi = 'havale' and k.banka_hesap_id = b.id and k.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(ko.tutar) from kamusal_odeme ko
      where ko.klinik_id = v_klinik_id and ko.odeme_yontemi = 'havale' and ko.banka_hesap_id = b.id
        and ko.odeme_tarihi is not null and ko.odeme_tarihi < p_once_tarih
    ), 0)
  from klinik_banka_hesaplari b
  where b.klinik_id = v_klinik_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) nakit_banka_hareketi: hesaplar aynı klinikten, aynı hesaba transfer yok
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nakit_banka_hareketi_hesap_butunluk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kaynak_banka_hesap_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = NEW.kaynak_banka_hesap_id AND b.klinik_id = NEW.klinik_id
  ) THEN
    RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hedef_banka_hesap_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = NEW.hedef_banka_hesap_id AND b.klinik_id = NEW.klinik_id
  ) THEN
    RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION nakit_banka_hareketi_hesap_butunluk() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_nakit_banka_hareketi_hesap_butunluk ON nakit_banka_hareketi;
CREATE TRIGGER trg_nakit_banka_hareketi_hesap_butunluk
  BEFORE INSERT OR UPDATE OF kaynak_banka_hesap_id, hedef_banka_hesap_id, klinik_id ON nakit_banka_hareketi
  FOR EACH ROW EXECUTE FUNCTION nakit_banka_hareketi_hesap_butunluk();

ALTER TABLE nakit_banka_hareketi DROP CONSTRAINT IF EXISTS nakit_banka_hareketi_farkli_hesap;
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_farkli_hesap CHECK (
  tip <> 'hesaplar_arasi'
  OR (
    NOT (kaynak_kasa AND hedef_kasa)
    AND (kaynak_banka_hesap_id IS NULL OR kaynak_banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id)
  )
) NOT VALID;

-- ---------------------------------------------------------------------------
-- 3) hasta_bakiye_hareket_borc_duzenle: fatura tutarı borçla tutarlı kalır
-- ---------------------------------------------------------------------------
create or replace function public.hasta_bakiye_hareket_borc_duzenle(
  p_hareket_id uuid,
  p_iskonto_tutari numeric,
  p_faturali boolean,
  p_aciklama text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_klinik_id uuid;
  v_hareket hasta_bakiye_hareket%rowtype;
  v_randevu randevu%rowtype;
  v_islem islem_tanimi%rowtype;
  v_kalem_aciklama text;
  v_kdv_orani numeric := 0;
  v_net_toplam numeric;
  v_odeme_id uuid;
  v_hasta hasta%rowtype;
  v_kimlik_var boolean;
  v_adres_var boolean;
  v_eksikler text[] := '{}';
begin
  v_klinik_id := current_klinik_id();

  if v_klinik_id is null or (current_rol() not in ('klinik_admin', 'resepsiyon', 'muhasebe') and not is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select * into v_hareket from hasta_bakiye_hareket
    where id = p_hareket_id and klinik_id = v_klinik_id for update;
  if not found then
    raise exception 'hareket_bulunamadi';
  end if;

  if v_hareket.tur <> 'borc' then
    raise exception 'gecersiz_hareket_turu';
  end if;

  if p_iskonto_tutari is null or p_iskonto_tutari < 0 then
    raise exception 'iskonto_gecersiz';
  end if;

  if p_iskonto_tutari > v_hareket.tutar then
    raise exception 'iskonto_fazla';
  end if;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;

  -- Kesilmiş (gönderilmiş) faturanın tutarı değiştirilemez; önce fatura iptal/iade edilmeli.
  if v_hareket.odeme_id is not null
     and p_iskonto_tutari is distinct from v_hareket.iskonto_tutari
     and exists (select 1 from fatura where odeme_id = v_hareket.odeme_id and durum = 'kesildi') then
    raise exception 'fatura_kesilmis';
  end if;

  update hasta_bakiye_hareket
  set iskonto_tutari = p_iskonto_tutari,
      iskonto_uygulayan_kullanici_id = auth.uid(),
      aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
  where id = p_hareket_id;

  -- Zaten faturalanmış borç: fatura tutarı borçla HER ZAMAN eşitlenir ("faturalı" kutusundan bağımsız).
  if v_hareket.odeme_id is not null then
    if v_net_toplam <= 0 then
      raise exception 'fatura_tutari_sifir';
    end if;
    update odeme set iskonto_tutari = p_iskonto_tutari, aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
      where id = v_hareket.odeme_id;
    update odeme_satiri set tutar = v_net_toplam where odeme_id = v_hareket.odeme_id;
    return;
  end if;

  if not p_faturali then
    return;
  end if;

  if v_net_toplam <= 0 then
    raise exception 'fatura_tutari_sifir';
  end if;

  if v_hareket.randevu_id is not null then
    select * into v_randevu from randevu where id = v_hareket.randevu_id;
    if found and v_randevu.islem_tanimi_id is not null then
      select * into v_islem from islem_tanimi where id = v_randevu.islem_tanimi_id;
      if found then
        v_kalem_aciklama := coalesce(nullif(v_islem.muhasebe_hizmet_ismi, ''), v_islem.ad);
        v_kdv_orani := v_islem.kdv_orani;
      end if;
    end if;
  end if;
  v_kalem_aciklama := coalesce(v_kalem_aciklama, v_hareket.aciklama, 'Borç');

  select * into v_hasta from hasta where id = v_hareket.hasta_id;

  select (kimlik_no is not null and kimlik_no <> ''), (adres is not null and adres <> '')
    into v_kimlik_var, v_adres_var
    from hasta_hassas where hasta_id = v_hareket.hasta_id;

  if v_hasta.ad_soyad is null or v_hasta.ad_soyad = '' then
    v_eksikler := array_append(v_eksikler, 'ad_soyad');
  end if;
  if v_hasta.eposta is null or v_hasta.eposta = '' then
    v_eksikler := array_append(v_eksikler, 'eposta');
  end if;
  if not coalesce(v_adres_var, false) then
    v_eksikler := array_append(v_eksikler, 'adres');
  end if;
  if not coalesce(v_kimlik_var, false) then
    v_eksikler := array_append(v_eksikler, 'kimlik_no');
  end if;

  if array_length(v_eksikler, 1) > 0 then
    raise exception 'fatura_bilgisi_eksik: %', array_to_string(v_eksikler, ',');
  end if;

  insert into odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  values (v_klinik_id, v_hareket.hasta_id, auth.uid(), p_iskonto_tutari, true, p_aciklama)
  returning id into v_odeme_id;

  insert into odeme_kalemi (odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani)
  values (v_odeme_id, v_islem.id, v_kalem_aciklama, 1, v_hareket.tutar, v_kdv_orani);

  insert into odeme_satiri (odeme_id, yontem, tutar)
  values (v_odeme_id, 'nakit', v_net_toplam);

  update hasta_bakiye_hareket set odeme_id = v_odeme_id where id = p_hareket_id;

  insert into fatura (klinik_id, odeme_id, durum)
  values (v_klinik_id, v_odeme_id, 'bekliyor');
end;
$function$;
