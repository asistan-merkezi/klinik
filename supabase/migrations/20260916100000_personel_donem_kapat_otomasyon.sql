begin;

-- ----------------------------------------------------------------------------
-- Aylık maaş hakedişinin otomatik tahakkuku: her ayın başında bir önceki
-- dönem, "Dönem Kapat" butonunun yaptığı AYNI iki RPC'yi (personel_puantaj_
-- donem_kapat + personel_hesap_hareket_donem_ekle) service_role ile çağıran
-- bir cron route'undan (app/api/cron/personel-donem-otomatik-kapat) kapatılır.
-- Formül/mantık DEĞİŞMEDİ — sadece bu iki RPC'nin yetki kontrolüne
-- `auth.role() = 'service_role'` yolu eklendi (mesaj_kredi_senkronla'daki
-- aynı desen, bkz. 20260816110000_mesaj_kredi_islevleri.sql). "hakediş elle
-- eklenemez" kuralı BOZULMUYOR: cron da aynı RPC'lerden, aynı hesaplamayla
-- geçiyor, sadece tetikleyici klinik_admin tıklaması yerine zamanlanmış görev.
-- ----------------------------------------------------------------------------

create or replace function personel_puantaj_donem_kapat(p_personel_id uuid, p_yil integer, p_ay integer)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
DECLARE
  v_is_service boolean := auth.role() = 'service_role';
  v_klinik_id uuid;
  v_personel personel%ROWTYPE;
  v_ay_baslangic date;
  v_ay_bitis date;
  v_net_dk numeric;
  v_fm_dk numeric;
  v_eksik_dk numeric;
  v_izin_gun integer;
  v_devamsizlik_gun integer;
  v_donem_id uuid;
  v_fm_saat numeric;
  v_hakedis_tutar numeric;
BEGIN
  IF NOT (v_is_service OR COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false)) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_personel FROM personel
  WHERE id = p_personel_id AND (v_is_service OR klinik_id = current_klinik_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  v_klinik_id := v_personel.klinik_id;

  IF EXISTS (
    SELECT 1 FROM personel_puantaj_donem
    WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay AND durum = 'kapali'
  ) THEN
    RAISE EXCEPTION 'donem_zaten_kapali';
  END IF;

  v_ay_baslangic := make_date(p_yil, p_ay, 1);
  v_ay_bitis := (v_ay_baslangic + interval '1 month')::date;

  SELECT
    COALESCE(SUM(net_calisma_dakika), 0),
    COALESCE(SUM(fazla_mesai_dakika) FILTER (WHERE fm_onay_durumu = 'onaylandi'), 0),
    COALESCE(SUM(eksik_calisma_dakika), 0),
    COUNT(*) FILTER (WHERE durum IN ('izinli', 'raporlu')),
    COUNT(*) FILTER (WHERE durum = 'gelmedi')
  INTO v_net_dk, v_fm_dk, v_eksik_dk, v_izin_gun, v_devamsizlik_gun
  FROM personel_puantaj
  WHERE personel_id = p_personel_id AND tarih >= v_ay_baslangic AND tarih < v_ay_bitis;

  INSERT INTO personel_puantaj_donem (
    klinik_id, personel_id, yil, ay, durum,
    snapshot_net_saat, snapshot_onayli_fm_saat, snapshot_eksik_saat,
    snapshot_izin_gun, snapshot_devamsizlik_gun, kapatan_id, kapatma_tarihi
  ) VALUES (
    v_klinik_id, p_personel_id, p_yil, p_ay, 'kapali',
    round(v_net_dk / 60.0, 2), round(v_fm_dk / 60.0, 2), round(v_eksik_dk / 60.0, 2),
    v_izin_gun, v_devamsizlik_gun, auth.uid(), now()
  )
  ON CONFLICT (personel_id, yil, ay) DO UPDATE SET
    durum = 'kapali',
    snapshot_net_saat = EXCLUDED.snapshot_net_saat,
    snapshot_onayli_fm_saat = EXCLUDED.snapshot_onayli_fm_saat,
    snapshot_eksik_saat = EXCLUDED.snapshot_eksik_saat,
    snapshot_izin_gun = EXCLUDED.snapshot_izin_gun,
    snapshot_devamsizlik_gun = EXCLUDED.snapshot_devamsizlik_gun,
    kapatan_id = EXCLUDED.kapatan_id,
    kapatma_tarihi = EXCLUDED.kapatma_tarihi
  RETURNING id INTO v_donem_id;

  v_fm_saat := round(v_fm_dk / 60.0, 2);

  IF v_fm_saat > 0 AND NOT EXISTS (
    SELECT 1 FROM personel_hesap_hareket WHERE kaynak_id = v_donem_id AND tur = 'mesai'
  ) THEN
    v_hakedis_tutar := COALESCE(v_personel.fm_saatlik_ucret, 0) * v_fm_saat;

    INSERT INTO personel_hesap_hareket (
      klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id
    ) VALUES (
      v_klinik_id, p_personel_id, 'mesai', GREATEST(v_hakedis_tutar, 0.01), (v_ay_bitis - 1),
      format(
        '%s/%s dönemi onaylı fazla mesai: %s sa%s', p_ay, p_yil, v_fm_saat,
        CASE WHEN v_personel.fm_saatlik_ucret IS NULL
          THEN ' — saatlik ücret tanımlı değil, tutar elle güncellenmeli'
          ELSE '' END
      ),
      v_donem_id, auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'donem_id', v_donem_id,
    'net_saat', round(v_net_dk / 60.0, 2),
    'onayli_fm_saat', v_fm_saat,
    'eksik_saat', round(v_eksik_dk / 60.0, 2),
    'izin_gun', v_izin_gun,
    'devamsizlik_gun', v_devamsizlik_gun
  );
END;
$$;

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
  v_is_service boolean := auth.role() = 'service_role';
  v_donem personel_puantaj_donem%rowtype;
begin
  if not (v_is_service or coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false)) then
    raise exception 'yetkisiz';
  end if;

  select * into v_donem from personel_puantaj_donem where id = p_donem_id;
  if not found or (not v_is_service and v_donem.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'donem_bulunamadi';
  end if;

  if exists (select 1 from personel_hesap_hareket where kaynak_id = p_donem_id and tur = 'hakedis') then
    raise exception 'zaten_islendi';
  end if;

  if p_hakedis_tutar < 0 then
    raise exception 'tutar_gecersiz';
  end if;

  insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
  values (
    v_donem.klinik_id, v_donem.personel_id, 'hakedis', p_hakedis_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
    format('%s/%s dönemi taban hakediş', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
  );

  if p_prim_tutar > 0 then
    insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
    values (
      v_donem.klinik_id, v_donem.personel_id, 'prim', p_prim_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
      format('%s/%s dönemi prim', v_donem.ay, v_donem.yil), p_donem_id, auth.uid()
    );
  end if;
end;
$$;

commit;
