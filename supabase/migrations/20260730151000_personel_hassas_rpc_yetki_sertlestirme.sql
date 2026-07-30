-- personel_hassas_kaydet / personel_hassas_maskeli_getir yetki kontrolü
-- "IF NOT (a OR b OR c)" deseni Postgres'in üç değerli mantığında (NULL) bir
-- session/auth.uid() context'i olmadığında (a OR b OR c) NULL'a düşürüyor,
-- "IF NOT NULL" da NULL olduğu için IF bloğu ÇALIŞMIYOR — yani yetki kontrolü
-- fail-closed değil fail-open oluyor. Gerçek uygulama trafiğinde PostgREST
-- authenticated bir JWT için auth.uid()'i hep dolduruyor, dolayısıyla bu
-- production'da tetiklenemiyordu (doğrulama sırasında ham psql/superuser
-- bağlantısıyla, yani session'sız çağrıldığında fark edildi) — yine de
-- savunma-derinliği için COALESCE(..., false) ile fail-closed'a çevriliyor.
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

  if not coalesce(
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id()),
    false
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

  if not coalesce(
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id())
    or v_personel.kullanici_id = auth.uid(),
    false
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

-- Kontrol: coalesce olmadan session'sız çağrı 'yetkisiz' vermeliydi, şimdi veriyor mu?
-- select personel_hassas_maskeli_getir((select id from personel limit 1));
