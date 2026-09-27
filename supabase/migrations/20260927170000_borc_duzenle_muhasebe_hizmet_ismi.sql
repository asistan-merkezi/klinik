-- Fatura kalemi açıklaması (odeme_kalemi.aciklama) artık tedavinin klinik
-- içi adı (islem_tanimi.ad) yerine, doluysa önce islem_tanimi.muhasebe_hizmet_ismi
-- kullanıyor — Kesilen Faturalar listesindeki "Açıklama" sütununun aynı
-- önceliği (bkz. app/(app)/panel/finans/gelirler-takibi/faturalar/page.tsx)
-- artık faturaya yazılan metinle de tutarlı. Fonksiyonun geri kalanı
-- (20260927160000) DEĞİŞMEDİ, yalnız v_kalem_aciklama ataması güncellendi.
begin;

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

  update hasta_bakiye_hareket
  set iskonto_tutari = p_iskonto_tutari,
      iskonto_uygulayan_kullanici_id = auth.uid(),
      aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
  where id = p_hareket_id;

  if not p_faturali then
    return;
  end if;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;

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

  if v_hareket.odeme_id is not null then
    update odeme set iskonto_tutari = p_iskonto_tutari, aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
      where id = v_hareket.odeme_id;
    update odeme_satiri set tutar = v_net_toplam where odeme_id = v_hareket.odeme_id;
    return;
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

commit;
