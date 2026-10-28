-- Arşiv İçe Aktarma: eski programdan toplu veri aktarımı (Ayarlar > Arşiv İçe
-- Aktarma, kullanıcı kararı — bkz. CLAUDE.md). Üç bölüm: Hastalar, Randevu/Seans
-- Geçmişi, Ödeme & Paket Geçmişi. Hepsi klinik_admin'e kilitli (hassas kimlik
-- verisi + finansal ledger + geri alınamaz toplu insert; resepsiyon dahil değil,
-- odeme_olustur/randevu_gelis_isaretle'nin aksine).
--
-- Mimari karar: TOPLU ve SATIR BAZLI HATA TOLERANSLI. odeme_olustur/
-- randevu_gelis_isaretle tek kayıt için tasarlanmıştı (bir hata = tüm işlem
-- reddedilir). Burada yüzlerce satır tek çağrıda işleniyor; randevu tablosundaki
-- oda/terapist/cihaz exclusion constraint'i (bkz. 20260726083923_cekirdek_sema.sql)
-- gibi nedenlerle bazı satırlar başarısız olabilir — bir satırın hatası diğerlerini
-- düşürmemeli. Bu yüzden her satır kendi BEGIN/EXCEPTION alt bloğunda (plpgsql'de
-- örtük savepoint) işlenip {satir_no, durum: eklendi|atlandi|hata, sebep} olarak
-- biriktiriliyor; fonksiyon hiçbir zaman "hepsi ya da hiçbiri" davranmıyor.
--
-- Bilinçli olarak KAPSAM DIŞI: KVKK/sağlık verisi/ticari ileti onay tarihleri bu
-- akıştan set EDİLMİYOR — eski programdaki bir satırdan gerçek bir rıza kaydı
-- üretmek hukuki bir varsayım olurdu, klinik bu onayları kendi akışlarıyla
-- (mevcut Kişisel Bilgi Giriş Formu / KVKK onay butonları) ayrıca almalı.
-- Belgeler (MR/reçete/foto arşivi) da kapsam dışı — dosya+metadata gerektiriyor,
-- ayrı bir tur.

-- ==================== 1) İzlenebilirlik kolonları ====================
-- Canlı KPI/no-show/ciro raporlarının eski verilerle karışmaması için (düşük
-- maliyetli, ileride WHERE kaynak = 'uygulama' filtresiyle kullanılabilir).
ALTER TABLE randevu ADD COLUMN IF NOT EXISTS kaynak text NOT NULL DEFAULT 'uygulama'
  CHECK (kaynak IN ('uygulama', 'arsiv'));
ALTER TABLE hasta_bakiye_hareket ADD COLUMN IF NOT EXISTS kaynak text NOT NULL DEFAULT 'uygulama'
  CHECK (kaynak IN ('uygulama', 'arsiv'));

-- ==================== 2) Hastalar ====================
-- p_kayitlar: [{ad_soyad, telefon, dogum_tarihi?, cinsiyet?, eposta?,
--   referans_kanali?, whatsapp_izin_durumu?, kimlik_no?, kimlik_no_tipi?,
--   adres?, il?, ilce?, mahalle?, acil_durum_ad_soyad?, acil_durum_yakinlik?,
--   acil_durum_telefon?, kronik_hastaliklar?, surekli_ilaclar?, alerjiler?,
--   gecirilmis_ameliyatlar?, gelis_sebebi?}, ...]
-- kimlik_no dolu ve klinikte zaten kayıtlıysa (idx_hasta_hassas_kimlik_no unique
-- index'i, bkz. 20260727210000) satır "atlandı" sayılır — aynı dosya güvenle
-- tekrar yüklenebilir (idempotent).
CREATE OR REPLACE FUNCTION public.hasta_arsiv_ice_aktar(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_hasta_id uuid;
  v_kimlik_no text;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      IF NULLIF(v_kayit->>'ad_soyad', '') IS NULL OR NULLIF(v_kayit->>'telefon', '') IS NULL THEN
        RAISE EXCEPTION 'ad_soyad_veya_telefon_eksik';
      END IF;

      INSERT INTO hasta (
        klinik_id, ad_soyad, telefon, dogum_tarihi, cinsiyet, eposta, referans_kanali,
        whatsapp_izin_durumu
      ) VALUES (
        v_klinik_id,
        v_kayit->>'ad_soyad',
        v_kayit->>'telefon',
        NULLIF(v_kayit->>'dogum_tarihi', '')::date,
        NULLIF(v_kayit->>'cinsiyet', ''),
        NULLIF(v_kayit->>'eposta', ''),
        NULLIF(v_kayit->>'referans_kanali', ''),
        COALESCE((v_kayit->>'whatsapp_izin_durumu')::boolean, false)
      )
      RETURNING id INTO v_hasta_id;

      v_kimlik_no := NULLIF(v_kayit->>'kimlik_no', '');

      IF v_kimlik_no IS NOT NULL
        OR NULLIF(v_kayit->>'adres', '') IS NOT NULL
        OR NULLIF(v_kayit->>'acil_durum_ad_soyad', '') IS NOT NULL
        OR NULLIF(v_kayit->>'kronik_hastaliklar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'surekli_ilaclar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'alerjiler', '') IS NOT NULL
        OR NULLIF(v_kayit->>'gecirilmis_ameliyatlar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'gelis_sebebi', '') IS NOT NULL
      THEN
        INSERT INTO hasta_hassas (
          hasta_id, klinik_id, kimlik_no, kimlik_no_tipi, adres, il, ilce, mahalle,
          acil_durum_ad_soyad, acil_durum_yakinlik, acil_durum_telefon,
          kronik_hastaliklar, surekli_ilaclar, alerjiler, gecirilmis_ameliyatlar, gelis_sebebi
        ) VALUES (
          v_hasta_id, v_klinik_id, v_kimlik_no,
          CASE WHEN v_kimlik_no IS NULL THEN NULL
               ELSE COALESCE(NULLIF(v_kayit->>'kimlik_no_tipi', ''), 'tc') END,
          NULLIF(v_kayit->>'adres', ''),
          NULLIF(v_kayit->>'il', ''),
          NULLIF(v_kayit->>'ilce', ''),
          NULLIF(v_kayit->>'mahalle', ''),
          NULLIF(v_kayit->>'acil_durum_ad_soyad', ''),
          NULLIF(v_kayit->>'acil_durum_yakinlik', ''),
          NULLIF(v_kayit->>'acil_durum_telefon', ''),
          NULLIF(v_kayit->>'kronik_hastaliklar', ''),
          NULLIF(v_kayit->>'surekli_ilaclar', ''),
          NULLIF(v_kayit->>'alerjiler', ''),
          NULLIF(v_kayit->>'gecirilmis_ameliyatlar', ''),
          NULLIF(v_kayit->>'gelis_sebebi', '')
        );
      END IF;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'hasta_id', v_hasta_id
      );
    EXCEPTION
      WHEN unique_violation THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'atlandi', 'sebep', 'Bu kimlik numarasına sahip bir hasta zaten kayıtlı.'
        );
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$;
REVOKE ALL ON FUNCTION public.hasta_arsiv_ice_aktar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hasta_arsiv_ice_aktar(jsonb) TO authenticated;

-- ==================== 3) Randevu / Seans Geçmişi ====================
-- p_kayitlar: [{hasta_id, terapist_id, oda_id, cihaz_id?, islem_tanimi_id?,
--   baslangic, bitis, tani?}, ...] — hasta_id/terapist_id/oda_id UI'da önceden
-- eşleştirilmiş olarak gelir (hasta: telefon eşleşmesi; terapist/oda: dosya
-- başına bir kere yapılan eşleştirme). Her ihtimale karşı üçü de burada ayrıca
-- v_klinik_id'ye ait mi diye doğrulanır (odeme_olustur'daki hasta/islem_tanimi
-- doğrulama deseniyle tutarlı — cross-tenant referans riski taşınmaz).
-- durum sabit 'tamamlandi' (geçmiş, elle tamamlanmış seans anlamına gelen enum
-- değeri, bkz. 20260731160000_randevu_seans_tamamlama), kaynak='arsiv'.
CREATE OR REPLACE FUNCTION public.randevu_arsiv_ice_aktar(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_randevu_id uuid;
  v_hasta_id uuid;
  v_terapist_id uuid;
  v_oda_id uuid;
  v_cihaz_id uuid;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_terapist_id := NULLIF(v_kayit->>'terapist_id', '')::uuid;
      v_oda_id := NULLIF(v_kayit->>'oda_id', '')::uuid;
      v_cihaz_id := NULLIF(v_kayit->>'cihaz_id', '')::uuid;

      IF v_hasta_id IS NULL OR v_terapist_id IS NULL OR v_oda_id IS NULL THEN
        RAISE EXCEPTION 'hasta_terapist_oda_eksik';
      END IF;
      IF NULLIF(v_kayit->>'baslangic', '') IS NULL OR NULLIF(v_kayit->>'bitis', '') IS NULL THEN
        RAISE EXCEPTION 'baslangic_bitis_eksik';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM terapist WHERE id = v_terapist_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'terapist_bulunamadi';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM oda WHERE id = v_oda_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'oda_bulunamadi';
      END IF;
      IF v_cihaz_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cihaz WHERE id = v_cihaz_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'cihaz_bulunamadi';
      END IF;

      INSERT INTO randevu (
        klinik_id, hasta_id, terapist_id, oda_id, cihaz_id, islem_tanimi_id,
        baslangic, bitis, durum, tani, kaynak, olusturan_kullanici_id
      ) VALUES (
        v_klinik_id, v_hasta_id, v_terapist_id, v_oda_id, v_cihaz_id,
        NULLIF(v_kayit->>'islem_tanimi_id', '')::uuid,
        (v_kayit->>'baslangic')::timestamptz,
        (v_kayit->>'bitis')::timestamptz,
        'tamamlandi', NULLIF(v_kayit->>'tani', ''), 'arsiv', auth.uid()
      )
      RETURNING id INTO v_randevu_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'randevu_id', v_randevu_id
      );
    EXCEPTION
      WHEN exclusion_violation THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'atlandi',
          'sebep', 'Bu terapist/oda için aynı zaman aralığında başka bir randevu var (çakışma).'
        );
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$;
REVOKE ALL ON FUNCTION public.randevu_arsiv_ice_aktar(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.randevu_arsiv_ice_aktar(jsonb) TO authenticated;

-- ==================== 4) Ödeme & Paket Geçmişi ====================
-- 4a) Bakiye hareketi (ödeme/kredi/borç geçmişi) — odeme_olustur'un AKSİNE
-- fatura kuyruğuna KESİNLİKLE satır eklemez (retroaktif veri girişi, gerçek bir
-- tahsilat değil) ve odeme/odeme_kalemi/odeme_satiri tablolarına dokunmaz,
-- doğrudan ledger'a (hasta_bakiye_hareket) yazar. p_tarih ile created_at
-- override edilir — bu projede created_at'i geçmiş bir tarihe ayarlayan tek yer
-- burasıdır.
-- p_kayitlar: [{hasta_id, tur ('odeme'|'kredi'|'borc'), tutar, tarih, aciklama?}, ...]
CREATE OR REPLACE FUNCTION public.hasta_bakiye_hareket_arsiv_ekle(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_hareket_id uuid;
  v_hasta_id uuid;
  v_tur text;
  v_tarih timestamptz;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_tur := NULLIF(v_kayit->>'tur', '');

      IF v_hasta_id IS NULL OR v_tur NOT IN ('odeme', 'kredi', 'borc') THEN
        RAISE EXCEPTION 'hasta_veya_tur_gecersiz';
      END IF;
      IF NULLIF(v_kayit->>'tutar', '') IS NULL OR (v_kayit->>'tutar')::numeric <= 0 THEN
        RAISE EXCEPTION 'tutar_gecersiz';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;

      v_tarih := COALESCE(NULLIF(v_kayit->>'tarih', '')::timestamptz, now());

      INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, aciklama, kaynak, created_at)
      VALUES (
        v_klinik_id, v_hasta_id, v_tur, (v_kayit->>'tutar')::numeric,
        COALESCE(NULLIF(v_kayit->>'aciklama', ''), 'Arşivden aktarıldı'), 'arsiv', v_tarih
      )
      RETURNING id INTO v_hareket_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'hareket_id', v_hareket_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$;
REVOKE ALL ON FUNCTION public.hasta_bakiye_hareket_arsiv_ekle(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hasta_bakiye_hareket_arsiv_ekle(jsonb) TO authenticated;

-- 4b) Kalan paket hakkı — dosya başına admin TEK bir mevcut paket tanımı seçer
-- (eski programın kendi kataloğu bu sistemdeki paket'lerle otomatik eşleşmez),
-- satırlar sadece hasta+kalan_adet+geçerlilik sağlar. odeme_id NULL kalır
-- (şema zaten nullable, bkz. 20260726210000_islem_paket_odeme_semasi).
-- p_kayitlar: [{hasta_id, kalan_adet, gecerlilik_bitis_tarihi, satis_tarihi?}, ...]
CREATE OR REPLACE FUNCTION public.paket_satis_arsiv_ekle(p_paket_id uuid, p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_paket_satis_id uuid;
  v_hasta_id uuid;
  v_kalan_adet integer;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM paket WHERE id = p_paket_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'paket_bulunamadi';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_kalan_adet := NULLIF(v_kayit->>'kalan_adet', '')::integer;

      IF v_hasta_id IS NULL OR v_kalan_adet IS NULL OR v_kalan_adet < 0 THEN
        RAISE EXCEPTION 'hasta_veya_kalan_adet_gecersiz';
      END IF;
      IF NULLIF(v_kayit->>'gecerlilik_bitis_tarihi', '') IS NULL THEN
        RAISE EXCEPTION 'gecerlilik_tarihi_eksik';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;

      INSERT INTO paket_satis (
        klinik_id, hasta_id, paket_id, kalan_adet, satis_tarihi, gecerlilik_bitis_tarihi, durum
      ) VALUES (
        v_klinik_id, v_hasta_id, p_paket_id, v_kalan_adet,
        COALESCE(NULLIF(v_kayit->>'satis_tarihi', '')::date, current_date),
        (v_kayit->>'gecerlilik_bitis_tarihi')::date,
        CASE WHEN v_kalan_adet <= 0 THEN 'bitti' ELSE 'aktif' END
      )
      RETURNING id INTO v_paket_satis_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'paket_satis_id', v_paket_satis_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$;
REVOKE ALL ON FUNCTION public.paket_satis_arsiv_ekle(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paket_satis_arsiv_ekle(uuid, jsonb) TO authenticated;

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'randevu' AND column_name = 'kaynak';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'hasta_bakiye_hareket' AND column_name = 'kaynak';
-- SELECT proname FROM pg_proc WHERE proname IN
--   ('hasta_arsiv_ice_aktar','randevu_arsiv_ice_aktar','hasta_bakiye_hareket_arsiv_ekle','paket_satis_arsiv_ekle');
