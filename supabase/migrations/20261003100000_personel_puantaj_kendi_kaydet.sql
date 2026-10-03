-- Puantaj PIN'i kaldırılıyor: giriş/çıkış kişinin KENDİ oturumuyla kaydedilir.
-- ADIM A (bu dosya): yeni fonksiyon eklenir, PIN yapısına DOKUNULMAZ — kod
-- canlıya çıkıp doğrulanana kadar eski QR akışı çalışmaya devam edebilsin.
-- ADIM B ayrı dosyada (20261003110000_puantaj_pin_kaldir.sql) ve kod
-- canlıya çıktıktan SONRA uygulanır (bkz. migration_before_push tersi sıra:
-- önce yeni şey, sonra eskinin silinmesi).
--
-- Kimlik auth.uid()'den gelir; parametre olarak kişi/klinik ALINMAZ. Saat
-- sunucudan (now()) — istemci saat gönderemez. Gün, Europe/Istanbul takvim
-- günüdür (current_date UTC'dir; 00:00-03:00 arası kayıt önceki güne düşerdi).
--
-- Kurallar: girişi olana ikinci giriş yok · girişsiz çıkış yok · çıkış ancak
-- girişten sonra · onaylı izin / raporlu gün ve hakedişi kapanmış ay reddedilir
-- · mevcut giriş/çıkış ezilmez (düzeltmeyi yönetici Puantaj Cetveli'nden yapar).
--
-- crypt() kullanılmadığı için search_path'e extensions şeması gerekmez.
CREATE OR REPLACE FUNCTION personel_puantaj_kendi_kaydet(p_tur text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_personel personel%ROWTYPE;
  v_saat timestamptz := now();
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_mevcut personel_puantaj%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;
  IF p_tur IS NULL OR p_tur NOT IN ('giris', 'cikis') THEN
    RAISE EXCEPTION 'tur_gecersiz';
  END IF;

  SELECT * INTO v_personel FROM personel p
  WHERE p.kullanici_id = auth.uid()
    AND p.aktif
    AND (p.isten_cikis_tarihi IS NULL OR p.isten_cikis_tarihi >= v_bugun)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  IF NOT personel_puantaj_donemi_acik_mi(v_personel.id, v_bugun) THEN
    RAISE EXCEPTION 'donem_kapali';
  END IF;

  -- Onaylı izin günü: onay anında iş günlerine 'izinli' satır yazılır, ama
  -- hafta sonu/tatile denk gelen izin günlerinde satır olmayabilir → talebe de bakılır.
  IF EXISTS (
    SELECT 1 FROM personel_izin_talebi t
    WHERE t.personel_id = v_personel.id
      AND t.durum = 'onaylandi'
      AND t.baslangic_tarih <= v_bugun
      AND t.bitis_tarih >= v_bugun
  ) THEN
    RAISE EXCEPTION 'izinli_gun';
  END IF;

  SELECT * INTO v_mevcut FROM personel_puantaj
  WHERE personel_id = v_personel.id AND tarih = v_bugun
  FOR UPDATE;

  IF FOUND AND v_mevcut.durum IN ('izinli', 'raporlu') THEN
    RAISE EXCEPTION 'izinli_gun';
  END IF;

  IF p_tur = 'giris' THEN
    IF FOUND AND v_mevcut.giris_saat IS NOT NULL THEN
      RAISE EXCEPTION 'giris_zaten_var';
    END IF;
    IF FOUND THEN
      UPDATE personel_puantaj
      SET giris_saat = v_saat, durum = 'calisti', kaynak = 'self_qr'
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
    IF v_saat <= v_mevcut.giris_saat THEN
      RAISE EXCEPTION 'cikis_giristen_once';
    END IF;
    UPDATE personel_puantaj SET cikis_saat = v_saat WHERE id = v_mevcut.id;
  END IF;

  RETURN jsonb_build_object('ad_soyad', v_personel.ad_soyad, 'tur', p_tur, 'saat', v_saat);
END;
$function$;

REVOKE ALL ON FUNCTION personel_puantaj_kendi_kaydet(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION personel_puantaj_kendi_kaydet(text) TO authenticated;

-- Kontrol:
-- SELECT has_function_privilege('anon', 'personel_puantaj_kendi_kaydet(text)', 'EXECUTE');          -- false
-- SELECT has_function_privilege('authenticated', 'personel_puantaj_kendi_kaydet(text)', 'EXECUTE'); -- true
