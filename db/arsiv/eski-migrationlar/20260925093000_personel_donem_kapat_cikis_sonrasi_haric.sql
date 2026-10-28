-- Kod incelemesi bulgusu: personel_puantaj_donem_kapat, dönemi kapatırken
-- personel_puantaj'daki net/fazla mesai/eksik saatleri sadece takvim ayına
-- göre (tarih >= ay_baslangic AND tarih < ay_bitis) topluyordu —
-- isten_cikis_tarihi'ne hiç bakmıyordu. Puantaj PIN'iyle kapı girişi
-- (personel_puantaj_pin_ile_kaydet RPC'si) sadece personel.aktif'i
-- kontrol ediyor, işten çıkış tarihini değil — yani biri işten çıktıktan
-- SONRA bile PIN'ini bilip kapıdan giriş/çıkış basarsa, o kayıt hâlâ ayın
-- geri kalanıyla birlikte fazla mesai/net saat hesabına giriyordu.
--
-- Fonksiyonun geri kalanı BİREBİR AYNI (20260916100000_personel_donem_kapat_
-- otomasyon.sql) — tek fark: personel_puantaj toplama sorgusunun üst sınırı,
-- işten çıkış tarihi o ayın içindeyse çıkış+1 güne çekiliyor (mesai ledger
-- kaydının tarihi hâlâ ayın son günü — sadece TOPLANAN veri sınırlanıyor,
-- kayıt tarihi anlamı değişmiyor).
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
  v_puantaj_ust_sinir date;
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

  v_puantaj_ust_sinir := v_ay_bitis;
  IF v_personel.isten_cikis_tarihi IS NOT NULL AND v_personel.isten_cikis_tarihi < v_ay_bitis THEN
    v_puantaj_ust_sinir := v_personel.isten_cikis_tarihi + 1;
  END IF;

  SELECT
    COALESCE(SUM(net_calisma_dakika), 0),
    COALESCE(SUM(fazla_mesai_dakika) FILTER (WHERE fm_onay_durumu = 'onaylandi'), 0),
    COALESCE(SUM(eksik_calisma_dakika), 0),
    COUNT(*) FILTER (WHERE durum IN ('izinli', 'raporlu')),
    COUNT(*) FILTER (WHERE durum = 'gelmedi')
  INTO v_net_dk, v_fm_dk, v_eksik_dk, v_izin_gun, v_devamsizlik_gun
  FROM personel_puantaj
  WHERE personel_id = p_personel_id AND tarih >= v_ay_baslangic AND tarih < v_puantaj_ust_sinir;

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

-- Kök neden: personel_puantaj_pin_ile_kaydet (kapı PIN'iyle giriş/çıkış),
-- personelin aktif olup olmadığına bakıyordu ama işten çıkış tarihine hiç
-- bakmıyordu — bilinçli olarak personel.aktif'e dokunulmadığı için (bkz.
-- personel/actions.ts'teki "işten çıkış tarihi girilince giriş iptal olsun"
-- özelliği) işten çıkmış biri PIN'ini bilmeye devam ettiği sürece kapıdan
-- giriş/çıkış basabiliyordu. Yukarıdaki dönem kapama düzeltmesi bunun
-- ETKİSİNİ (hakedişe yansımasını) sınırlıyor, bu ise KÖKÜNÜ kapatıyor —
-- kaydın kendisi hiç oluşamaz. Aynı genel "pin_bulunamadi" hatası korunuyor
-- (hangi PIN'in kime ait olduğu/var olduğu sızdırılmaz).
CREATE OR REPLACE FUNCTION personel_puantaj_pin_ile_kaydet(p_klinik_id uuid, p_pin text, p_tur text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_personel personel%ROWTYPE;
  v_bugun date := current_date;
  v_mevcut personel_puantaj%ROWTYPE;
  v_saat timestamptz := now();
BEGIN
  IF p_tur NOT IN ('giris', 'cikis') THEN
    RAISE EXCEPTION 'tur_gecersiz';
  END IF;

  IF p_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'pin_gecersiz';
  END IF;

  SELECT * INTO v_personel FROM personel p
  WHERE p.klinik_id = p_klinik_id
    AND p.aktif
    AND (p.isten_cikis_tarihi IS NULL OR p.isten_cikis_tarihi >= v_bugun)
    AND p.puantaj_pin_hash IS NOT NULL
    AND crypt(p_pin, p.puantaj_pin_hash) = p.puantaj_pin_hash
  LIMIT 1;

  -- Tek genel hata mesajı — "bu PIN kime ait/var mı" bilgisi sızdırılmaz.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pin_bulunamadi';
  END IF;

  IF NOT personel_puantaj_donemi_acik_mi(v_personel.id, v_bugun) THEN
    RAISE EXCEPTION 'donem_kapali';
  END IF;

  SELECT * INTO v_mevcut FROM personel_puantaj
  WHERE personel_id = v_personel.id AND tarih = v_bugun;

  IF p_tur = 'giris' THEN
    IF FOUND AND v_mevcut.giris_saat IS NOT NULL THEN
      RAISE EXCEPTION 'giris_zaten_var';
    END IF;

    IF FOUND THEN
      UPDATE personel_puantaj SET giris_saat = v_saat, kaynak = 'self_qr'
      WHERE id = v_mevcut.id;
    ELSE
      INSERT INTO personel_puantaj (personel_id, tarih, giris_saat, durum, kaynak)
      VALUES (v_personel.id, v_bugun, v_saat, 'calisti', 'self_qr');
    END IF;
  ELSE
    IF NOT FOUND OR v_mevcut.giris_saat IS NULL THEN
      RAISE EXCEPTION 'once_giris_gerekli';
    END IF;
    IF v_mevcut.cikis_saat IS NOT NULL THEN
      RAISE EXCEPTION 'cikis_zaten_var';
    END IF;

    UPDATE personel_puantaj SET cikis_saat = v_saat WHERE id = v_mevcut.id;
  END IF;

  RETURN jsonb_build_object('ad_soyad', v_personel.ad_soyad, 'tur', p_tur, 'saat', v_saat);
END;
$function$;

-- Kontrol:
-- SELECT pg_get_functiondef('personel_puantaj_donem_kapat(uuid,integer,integer)'::regprocedure); -- v_puantaj_ust_sinir görünmeli
-- SELECT pg_get_functiondef('personel_puantaj_pin_ile_kaydet(uuid,text,text)'::regprocedure); -- isten_cikis_tarihi kontrolü görünmeli
