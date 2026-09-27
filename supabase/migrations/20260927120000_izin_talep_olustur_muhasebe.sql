-- İzin talebi oluşturma: muhasebe rolü de başka bir personel adına talep açabilsin.
-- ============================================================================
-- Onaylama/reddetme YETKİSİ hâlâ SADECE klinik_admin'de (bilinçli tercih —
-- muhasebe rolü kök CLAUDE.md'de "personel yönetimi bilinçli kapalı" olarak
-- tanımlı, izin ONAYLAMA bunun içine giriyor). Bu migration SADECE "beklemede"
-- bir talep OLUŞTURMA yetkisini genişletiyor (personel_izin_talebi_onayla/
-- reddet/yonetici_iptal RPC'lerine dokunulmadı) — departman→kişi seçerek
-- başka bir personel adına talep açıp onayı klinik_admin'e bırakabilsinler.
-- ============================================================================

begin;

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
    current_rol() in ('klinik_admin', 'muhasebe')
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

commit;
