-- Adversarial review bulgusu: personel_izin_is_gunu_sayisi(baslangic, bitis)
-- herhangi bir authenticated kullanıcıya (rol farketmeksizin) EXECUTE açık —
-- canlı önizleme için bilinçli, ama üst sınır YOKTU. Aşırı geniş bir aralık
-- (örn. 1000+ yıl) PL/pgSQL WHILE döngüsünü milyonlarca kez çevirip DB CPU'sunu
-- tüketebilir — authenticated herhangi bir hesaptan (terapist/resepsiyon dahil)
-- tetiklenebilecek bir DoS vektörü. personel_izin_talep_olustur da aynı
-- fonksiyonu çağırdığı için aynı düzeltmeyle otomatik korunuyor.
create or replace function personel_izin_is_gunu_sayisi(p_baslangic date, p_bitis date)
returns integer
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_klinik_id uuid := current_klinik_id();
  v_klinik klinik%rowtype;
  v_gun date;
  v_sayac integer := 0;
  v_dow integer;
begin
  if p_bitis < p_baslangic then
    raise exception 'tarih_araligi_gecersiz';
  end if;

  if p_bitis - p_baslangic > 366 then
    raise exception 'tarih_araligi_cok_uzun';
  end if;

  select * into v_klinik from klinik where id = v_klinik_id;

  v_gun := p_baslangic;
  while v_gun <= p_bitis loop
    v_dow := extract(dow from v_gun)::int;
    if (v_dow = 0 and v_klinik.pazar_baslangic is null)
       or (v_dow = 6 and v_klinik.cumartesi_baslangic is null) then
      null;
    elsif exists (
      select 1 from resmi_tatil rt
      where rt.tarih = v_gun and (rt.klinik_id is null or rt.klinik_id = v_klinik_id)
    ) then
      null;
    else
      v_sayac := v_sayac + 1;
    end if;
    v_gun := v_gun + 1;
  end loop;

  return v_sayac;
end;
$$;
