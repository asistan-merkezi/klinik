-- =====================================================================
-- Personel: T.C. Kimlik / Pasaport artık düz metin olarak saklanıyor.
--
-- Gerekçe: şifreleme anahtarı hiçbir zaman kurulmamıştı (canlıda 0 satır
-- doluydu — personel_hassas_kaydet anahtar yoksa yazmayı zaten reddediyordu,
-- 'sifreleme_anahtari_kurulu_degil' hatasıyla), bu da T.C./Pasaport'un HİÇ
-- kaydedilememesine yol açıyordu. Kullanıcı kararıyla şifreleme tamamen
-- kaldırıldı — izolasyon RLS ile sağlanıyor (sadece klinik_admin/kendisi,
-- personel_hassas_maskeli_getir RPC'si düz metni yine client'a döndürmüyor,
-- sadece son 2 hane).
-- =====================================================================

alter table personel_hassas
  add column if not exists tc_kimlik text,
  add column if not exists pasaport_no text;

-- v_personel_bilgi_durumu (20260810090000) eski *_sifreli kolonlarına
-- bağımlı — düz metin kolonlara işaret edecek şekilde önce burada
-- yeniden tanımlanıyor, yoksa aşağıdaki DROP COLUMN "depends on" hatası verir.
CREATE OR REPLACE VIEW v_personel_bilgi_durumu WITH (security_invoker = true) AS
SELECT
  p.id AS personel_id,
  (
    p.dogum_tarihi IS NOT NULL
    AND (COALESCE(p.il, '') <> '' OR COALESCE(p.adres, '') <> '')
    AND EXISTS (SELECT 1 FROM personel_acil_kisi ak WHERE ak.personel_id = p.id)
    AND EXISTS (
      SELECT 1 FROM personel_hassas ph
      WHERE ph.personel_id = p.id AND (ph.tc_kimlik IS NOT NULL OR ph.pasaport_no IS NOT NULL)
    )
    AND (
      k.rol IS DISTINCT FROM 'terapist'
      OR EXISTS (
        SELECT 1 FROM personel_mesleki_belge mb
        WHERE mb.personel_id = p.id AND (mb.diploma_no IS NOT NULL OR mb.uzmanlik_belge_no IS NOT NULL)
      )
    )
  ) AS bilgiler_tamam
FROM personel p
LEFT JOIN kullanici k ON k.id = p.kullanici_id;

alter table personel_hassas
  drop column if exists tc_kimlik_sifreli,
  drop column if exists pasaport_no_sifreli;

create or replace function personel_hassas_kaydet(p_personel_id uuid, p_tc_kimlik text, p_pasaport text)
returns void as $$
declare
  v_personel personel%rowtype;
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

  insert into personel_hassas (personel_id, tc_kimlik, pasaport_no)
  values (
    p_personel_id,
    case when p_tc_kimlik is null or p_tc_kimlik = '' then null else p_tc_kimlik end,
    case when p_pasaport is null or p_pasaport = '' then null else p_pasaport end
  )
  on conflict (personel_id) do update set
    tc_kimlik = excluded.tc_kimlik,
    pasaport_no = excluded.pasaport_no,
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
    return jsonb_build_object('tc_kimlik_var', false, 'tc_kimlik_son2', null, 'pasaport_var', false, 'pasaport_son2', null);
  end if;

  return jsonb_build_object(
    'tc_kimlik_var', v_row.tc_kimlik is not null,
    'tc_kimlik_son2', case when v_row.tc_kimlik is not null then right(v_row.tc_kimlik, 2) else null end,
    'pasaport_var', v_row.pasaport_no is not null,
    'pasaport_son2', case when v_row.pasaport_no is not null then right(v_row.pasaport_no, 2) else null end
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Kontrol:
-- select column_name from information_schema.columns where table_name = 'personel_hassas';
