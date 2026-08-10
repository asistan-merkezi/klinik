-- Personel Puantaj PIN: personel klinik kapısındaki QR'ı kendi telefonuyla
-- okutup 6 haneli PIN'ini girerek KENDİ giriş/çıkış saatini kaydedebiliyor
-- (şu ana kadar bu SADECE klinik_admin'in Personel Listesi'nden elle yaptığı
-- bir aksiyondu, bkz. hizliPuantajKaydet).
--
-- Kullanıcı kararları:
-- - QR okutulunca isim SEÇİLMİYOR, sadece PIN giriliyor — PIN klinikteki tüm
--   aktif personelin hash'lerine karşı eşleştiriliyor.
-- - PIN'i personel KENDİSİ belirliyor (zaten mevcut panel girişiyle, Personel
--   Detay'daki kendi görünümünden); admin unutma durumunda sıfırlayabiliyor.
--
-- Tasarım kararları:
-- - PIN, personel_hassas'taki TERSİNE ÇEVRİLEBİLİR pgp_sym_encrypt (TC kimlik
--   için) İLE KARIŞTIRILMADI — PIN sadece doğrulama amaçlı, farklı bir tehdit
--   modeli, bu yüzden pgcrypto crypt()/gen_salt('bf') (TEK YÖNLÜ hash)
--   kullanılıyor. Düz metin PIN hiçbir RPC dönüşünde/SELECT'te yer almıyor.
-- - PIN'ler bcrypt salt'lı olduğu için aynı PIN farklı hash üretiyor, DB
--   seviyesinde UNIQUE constraint mümkün değil — klinik-içi tekillik
--   personel_puantaj_pin_belirle RPC'sinde (set anında diğer personelin
--   hash'leriyle crypt() karşılaştırması) garanti ediliyor. Aksi halde
--   personel_puantaj_pin_ile_kaydet iki personeli aynı PIN'e eşleyebilirdi.
-- - 6 hane (4 değil): QR'da isim seçilmediği için PIN "klinikteki N personel"
--   havuzuna karşı deneniyor (doğum günü paradoksuna benzer etki) — 4 haneli
--   (10.000 kombinasyon) bir klinikte 20 personelle ~%0.2 rastgele başarı
--   ihtimaline denk gelirdi, 6 hane (1.000.000 kombinasyon) bunu ~%0.002'ye
--   indiriyor.
-- - pgcrypto bu veritabanında `extensions` şemasına kurulu (public'e DEĞİL —
--   `SELECT extname, extnamespace::regnamespace FROM pg_extension` ile
--   doğrulandı). Fonksiyonlar `SET search_path = public` ile tanımlanırsa
--   `crypt()`/`gen_salt()` "does not exist" hatası verir — bu turda gerçek bir
--   RPC testiyle (psql üzerinden) BULUNDU, bu yüzden bu 3 fonksiyon
--   `search_path = public, extensions` kullanıyor. Not: mevcut
--   `personel_hassas_kaydet` de aynı `pgp_sym_encrypt` çağrısını
--   `search_path=public` ile yapıyor — bu ortamda şifreleme anahtarı hiç
--   kurulu olmadığı için (`sifreleme_anahtari_kurulu_degil` guard'ı erken
--   dönüyor) bu aynı hata orada hiç tetiklenmemiş/gözlemlenememiş, muhtemelen
--   uykuda bir hata; bu migration'ın kapsamı dışında bırakıldı, ayrıca not
--   düşüldü.
-- - Rate limiting / kilitleme BİLİNÇLİ OLARAK eklenmedi — projenin mevcut 4
--   anonim QR akışı (hasta/personel/iş başvurusu/anket, bkz.
--   20260804100000_qr_genel_kayit.sql) da aynı ölçüde bırakılmıştı ("bilinen
--   kısıt, dokümante edildi"). Bu QR'lar klinik binasına asılı fiziksel
--   kodlar, dış dünyaya paylaşılan bir link değil — tehdit yüzeyi diğer 4
--   karttan yapısal olarak daha düşük. Genel/bilgi sızdırmayan hata mesajı
--   ("pin_bulunamadi") tek koruma katmanı.

ALTER TABLE personel ADD COLUMN IF NOT EXISTS puantaj_pin_hash text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS puantaj_pin_guncelleme_tarihi timestamptz;

-- kaynak CHECK'e 'self_qr' eklenmesi (mevcut kısıt adsız tanımlanmıştı, Postgres
-- varsayılan adı personel_puantaj_kaynak_check).
ALTER TABLE personel_puantaj DROP CONSTRAINT IF EXISTS personel_puantaj_kaynak_check;
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_kaynak_check
  CHECK (kaynak IN ('manuel', 'tablet', 'self_qr'));

-- ============================================================
-- personel_puantaj_pin_belirle — personel kendi PIN'ini set/değiştirir,
-- admin de bir personel için set edebilir (personel_hassas_kaydet ile aynı
-- yetki deseni: is_super_admin OR admin-kendi-kliniginde OR kendisi).
-- ============================================================
CREATE OR REPLACE FUNCTION personel_puantaj_pin_belirle(p_personel_id uuid, p_yeni_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_personel personel%ROWTYPE;
  v_cakisma boolean;
BEGIN
  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  -- COALESCE(..., false) ile fail-closed: personel_hassas_kaydet'te daha önce
  -- bulunan "auth.uid() NULL iken (a OR b OR c) NULL'a düşüyor, IF NOT NULL
  -- hiç çalışmıyor" fail-open hatasının aynısı burada tekrarlanmasın diye
  -- (bkz. 20260730151000_personel_hassas_rpc_yetki_sertlestirme.sql).
  IF NOT COALESCE(
    is_super_admin()
    OR (current_rol() = 'klinik_admin' AND v_personel.klinik_id = current_klinik_id())
    OR v_personel.kullanici_id = auth.uid(),
    false
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_yeni_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'pin_gecersiz';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM personel p
    WHERE p.klinik_id = v_personel.klinik_id
      AND p.id <> p_personel_id
      AND p.aktif
      AND p.puantaj_pin_hash IS NOT NULL
      AND crypt(p_yeni_pin, p.puantaj_pin_hash) = p.puantaj_pin_hash
  ) INTO v_cakisma;

  IF v_cakisma THEN
    RAISE EXCEPTION 'pin_kullanimda';
  END IF;

  UPDATE personel
  SET puantaj_pin_hash = crypt(p_yeni_pin, gen_salt('bf')),
      puantaj_pin_guncelleme_tarihi = now()
  WHERE id = p_personel_id;
END;
$function$;

REVOKE ALL ON FUNCTION personel_puantaj_pin_belirle(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_pin_belirle(uuid, text) TO authenticated;

-- ============================================================
-- personel_puantaj_pin_sifirla — sadece admin (personel unuttuğunda temizler,
-- personel bir dahaki panel girişinde kendi PIN'ini yeniden set eder).
-- ============================================================
CREATE OR REPLACE FUNCTION personel_puantaj_pin_sifirla(p_personel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_personel personel%ROWTYPE;
BEGIN
  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  IF NOT COALESCE(
    is_super_admin()
    OR (current_rol() = 'klinik_admin' AND v_personel.klinik_id = current_klinik_id()),
    false
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE personel
  SET puantaj_pin_hash = NULL, puantaj_pin_guncelleme_tarihi = NULL
  WHERE id = p_personel_id;
END;
$function$;

REVOKE ALL ON FUNCTION personel_puantaj_pin_sifirla(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_pin_sifirla(uuid) TO authenticated;

-- ============================================================
-- personel_puantaj_pin_ile_kaydet — anonim (QR'ı okutan kişi henüz giriş
-- yapmamış), SECURITY DEFINER ile personel_puantaj'ın "sadece klinik_admin
-- INSERT/UPDATE edebilir" RLS'ini bypass ediyor (odeme_olustur/
-- randevu_gelis_isaretle ile aynı desen). hizliPuantajKaydet'teki (bkz.
-- app/(app)/panel/personel/actions.ts) idempotency kuralları SQL'e taşındı:
-- giriş zaten varsa/çıkış girişsiz olamaz/çıkış zaten varsa hep reddedilir.
-- ============================================================
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

REVOKE ALL ON FUNCTION personel_puantaj_pin_ile_kaydet(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_pin_ile_kaydet(uuid, text, text) TO anon, authenticated;

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname LIKE 'personel_puantaj_pin%';
-- SELECT conname FROM pg_constraint WHERE conname = 'personel_puantaj_kaynak_check';
