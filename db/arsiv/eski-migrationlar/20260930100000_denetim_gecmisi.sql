-- Denetim Geçmişi (klinik_admin paneli) altyapısı: finans + hasta kayıtlarının
-- değişikliklerini audit_log'a yazar.
--
-- Önceki durum: audit_log_yaz() yalnız 15 klinik/personel tablosunda tetikliydi
-- (hedef, ölçüm, belge, onam, anamnez, puantaj vb.); hasta bakiyesi, fatura,
-- gider, kamusal ödeme, Kasa/Banka hareketi ve hasta kimlik bilgisi HİÇ
-- kaydedilmiyordu. Ayrıca UPDATE'te yalnız YENİ satır yazıldığı için "hangi alan
-- neyden neye değişti" görülemiyordu.
--
-- Yeni generic fonksiyon audit_log_degisiklik_yaz() ("surum": 2 detay şekli):
--   INSERT → {"surum":2, "yeni": {satır}}
--   UPDATE → {"surum":2, "degisen_alanlar":[..], "eski":{yalnız değişenler}, "yeni":{..}}
--            (yalnız updated_at değişen UPDATE'ler hiç kaydedilmez)
--   DELETE → {"surum":2, "eski": {satır}}
--   Satırda hasta_id varsa her şekilde üst seviyeye "hasta_id" bağlamı eklenir.
--   Tetikleyici argümanı 'sadece_alan_adi' ise DEĞER hiç yazılmaz, yalnız
--   değişen alan ADLARI (hasta_hassas: TC/adres/tıbbi bayraklar audit_log'a
--   ikinci bir kopya olarak düşmesin).
--
-- Eski audit_log_yaz() ve mevcut tetikleyiciler DEĞİŞMEDİ (v1 satırları
-- olduğu gibi kalır; panel ikisini de okur).
--
-- İŞ YAZIMINI ENGELLEMEZ: kayıt yazılırken hata olursa RAISE WARNING ile
-- Postgres loguna düşer, ödeme/fatura/hasta işlemi yine tamamlanır. Bilinçli
-- ödünleşim: bir denetim hatası kliniğin tahsilatını durdurmasın (tersi
-- kabul edilirse EXCEPTION bloğu kaldırılır).
--
-- Fonksiyon adı/imzası yeni — mevcut bir fonksiyona parametre eklenmiyor
-- (PGRST203 overload tuzağı yok). İdempotent.

-- Klinik silinirken (ON DELETE CASCADE) alt tabloların tetikleyicileri klinik_id'si
-- artık var olmayan audit_log satırı eklemeye çalışıp FK hatasıyla tüm silmeyi
-- bozmasın diye klinik var mı kontrol edilir.
create or replace function audit_log_degisiklik_yaz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yeni jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_eski jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_satir jsonb := coalesce(v_yeni, v_eski);
  v_sadece_alan_adi boolean := coalesce(tg_argv[0], '') = 'sadece_alan_adi';
  v_klinik_id uuid;
  v_hedef_id uuid;
  v_degisen text[];
  v_detay jsonb;
begin
  begin
    v_klinik_id := (v_satir ->> 'klinik_id')::uuid;
    -- hasta_hassas'ın PK'sı id değil hasta_id
    v_hedef_id := coalesce(v_satir ->> 'id', v_satir ->> 'hasta_id')::uuid;

    if v_klinik_id is null or not exists (select 1 from klinik where id = v_klinik_id) then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE' then
      select coalesce(array_agg(k order by k), '{}')
        into v_degisen
        from jsonb_object_keys(v_yeni) as k
       where k <> 'updated_at' and (v_yeni -> k) is distinct from (v_eski -> k);

      if coalesce(array_length(v_degisen, 1), 0) = 0 then
        return new;
      end if;

      -- hasta.risk_bayraklari zaten eski trg_musteri_risk_audit ile kaydediliyor
      if tg_table_name = 'hasta' and v_degisen = array['risk_bayraklari'] then
        return new;
      end if;

      v_detay := jsonb_build_object('surum', 2, 'degisen_alanlar', to_jsonb(v_degisen));
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object(
          'eski', (select jsonb_object_agg(k, v_eski -> k) from unnest(v_degisen) as k),
          'yeni', (select jsonb_object_agg(k, v_yeni -> k) from unnest(v_degisen) as k)
        );
      end if;
    elsif tg_op = 'INSERT' then
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('yeni', v_yeni);
      end if;
    else
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('eski', v_eski);
      end if;
    end if;

    -- UPDATE'te yalnız değişen alanlar tutulduğundan satırın hangi hastaya ait
    -- olduğu kaybolmasın (panel "Hasta" sütunu) — bağlam alanı olarak her zaman eklenir.
    if v_satir ->> 'hasta_id' is not null then
      v_detay := v_detay || jsonb_build_object('hasta_id', v_satir ->> 'hasta_id');
    end if;

    insert into audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
    values (v_klinik_id, auth.uid(), lower(tg_op), tg_table_name, v_hedef_id, v_detay);
  exception when others then
    raise warning 'audit_log_degisiklik_yaz hatası (% %): %', tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$$;

-- Panel sorgusu: klinik + tarih sıralı, sayfalı okuma.
create index if not exists idx_audit_log_klinik_tarih on audit_log (klinik_id, created_at desc);

-- ==================== Finans ====================
drop trigger if exists trg_hasta_bakiye_hareket_denetim on hasta_bakiye_hareket;
create trigger trg_hasta_bakiye_hareket_denetim
  after insert or update or delete on hasta_bakiye_hareket
  for each row execute function audit_log_degisiklik_yaz();

drop trigger if exists trg_fatura_denetim on fatura;
create trigger trg_fatura_denetim
  after insert or update or delete on fatura
  for each row execute function audit_log_degisiklik_yaz();

drop trigger if exists trg_klinik_harcama_denetim on klinik_harcama;
create trigger trg_klinik_harcama_denetim
  after insert or update or delete on klinik_harcama
  for each row execute function audit_log_degisiklik_yaz();

drop trigger if exists trg_kamusal_odeme_denetim on kamusal_odeme;
create trigger trg_kamusal_odeme_denetim
  after insert or update or delete on kamusal_odeme
  for each row execute function audit_log_degisiklik_yaz();

drop trigger if exists trg_nakit_banka_hareketi_denetim on nakit_banka_hareketi;
create trigger trg_nakit_banka_hareketi_denetim
  after insert or update or delete on nakit_banka_hareketi
  for each row execute function audit_log_degisiklik_yaz();

drop trigger if exists trg_paket_satis_denetim on paket_satis;
create trigger trg_paket_satis_denetim
  after insert or update or delete on paket_satis
  for each row execute function audit_log_degisiklik_yaz();

-- ==================== Hasta ====================
drop trigger if exists trg_hasta_denetim on hasta;
create trigger trg_hasta_denetim
  after insert or update or delete on hasta
  for each row execute function audit_log_degisiklik_yaz();

-- hasta_hassas: kimlik no / adres / tıbbi ön geçmiş bayrakları — DEĞER yazılmaz,
-- yalnız hangi alanların değiştiği.
drop trigger if exists trg_hasta_hassas_denetim on hasta_hassas;
create trigger trg_hasta_hassas_denetim
  after insert or update or delete on hasta_hassas
  for each row execute function audit_log_degisiklik_yaz('sadece_alan_adi');

-- Kontrol:
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg\_%\_denetim' ORDER BY 1;  -- 8 satır beklenir
-- Uçtan uca (geçici hasta + ödeme ekle → audit_log'da surum=2 satır) uygulama tarafında doğrulanır.
