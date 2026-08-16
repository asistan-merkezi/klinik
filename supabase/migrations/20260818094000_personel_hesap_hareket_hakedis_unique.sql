-- Adversarial review bulgusu: personel_hesap_hareket_donem_ekle "NOT EXISTS"
-- kontrolüyle idempotency sağlıyordu ama SELECT'i FOR UPDATE ile kilitlemiyordu
-- — iki eşzamanlı çağrı (örn. çift tıklama, retry) teorik olarak ikisi de
-- "yok" görüp aynı döneme iki kez 'hakedis' yazabilirdi. Uygulama seviyesindeki
-- kontrolü DB seviyesinde garanti altına alan bir unique index ekleniyor —
-- ikinci eşzamanlı INSERT artık "zaten var" hatasıyla güvenle reddediliyor.
create unique index idx_personel_hesap_hareket_hakedis_tekil
  on personel_hesap_hareket (kaynak_id)
  where tur = 'hakedis';

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

  if p_hakedis_tutar < 0 then
    raise exception 'tutar_gecersiz';
  end if;

  begin
    insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
    values (
      v_donem.klinik_id, v_donem.personel_id, 'hakedis', p_hakedis_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
      format('%s/%s dönemi taban hakediş', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
    );
  exception
    when unique_violation then
      raise exception 'zaten_islendi';
  end;

  if p_prim_tutar > 0 then
    insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
    values (
      v_donem.klinik_id, v_donem.personel_id, 'prim', p_prim_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
      format('%s/%s dönemi prim', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
    );
  end if;
end;
$$;
