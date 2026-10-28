-- personel_puantaj_donem_kapat/_yeniden_ac'te, personel_hassas RPC'lerinde
-- daha önce bulunup 20260730151000'de düzeltilen AYNI fail-open desenini
-- tekrar yazmışım: "IF NOT (current_rol() = 'klinik_admin' OR is_super_admin())"
-- — Postgres'in üç değerli mantığında session/auth.uid() context'i olmadığında
-- (current_rol() NULL döner) ifade NULL'a düşüyor, "IF NOT NULL" de NULL
-- olduğu için RAISE hiç çalışmıyor (fail-open). Servis-rolü ile (oturumsuz)
-- gerçek bir çağrıyla doğrulandı: personel_puantaj_donem_kapat, yetkisiz
-- hatası vermeden doğrudan "personel_bulunamadi"ya geçti — yetki kontrolü
-- sessizce atlanmış oldu. PostgREST üzerinden gerçek authenticated istekte
-- auth.uid() hep dolu olduğu için production'da normal koşullarda
-- tetiklenemez, ama yine de COALESCE(..., false) ile fail-closed'a çevriliyor
-- (aynı gerekçe, aynı düzeltme deseni).
CREATE OR REPLACE FUNCTION personel_puantaj_donem_kapat(p_personel_id uuid, p_yil integer, p_ay integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
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
  v_klinik_id := current_klinik_id();
  IF NOT COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id AND (klinik_id = v_klinik_id OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

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

  IF v_fm_saat > 0 AND NOT EXISTS (SELECT 1 FROM personel_ekstra_hakedis WHERE puantaj_donem_id = v_donem_id) THEN
    v_hakedis_tutar := COALESCE(v_personel.fm_saatlik_ucret, 0) * v_fm_saat;

    INSERT INTO personel_ekstra_hakedis (
      klinik_id, personel_id, tur, tutar, tarih, aciklama, ekleyen_kullanici_id, puantaj_donem_id
    ) VALUES (
      v_klinik_id, p_personel_id, 'mesai', v_hakedis_tutar, (v_ay_bitis - 1),
      format(
        '%s/%s dönemi onaylı fazla mesai: %s sa%s', p_ay, p_yil, v_fm_saat,
        CASE WHEN v_personel.fm_saatlik_ucret IS NULL
          THEN ' — saatlik ücret tanımlı değil, tutar elle güncellenmeli'
          ELSE '' END
      ),
      auth.uid(), v_donem_id
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
$function$;

CREATE OR REPLACE FUNCTION personel_puantaj_donem_yeniden_ac(p_personel_id uuid, p_yil integer, p_ay integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE personel_puantaj_donem
  SET durum = 'acik', kapatan_id = NULL, kapatma_tarihi = NULL
  WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay
    AND klinik_id = current_klinik_id()
    AND durum = 'kapali';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'donem_bulunamadi_veya_zaten_acik';
  END IF;
END;
$function$;

-- Kontrol: servis-rolüyle (oturumsuz) çağrıda artık "yetkisiz" dönmeli.
