-- Kullanıcı kararı (üçüncü ve son tur): İşlem (borç) ve Ödeme her zaman iki
-- AYRI, kalıcı satır olarak kalsın — "borç gelir, ödeme girersin, borç
-- düşer, bu kadar". Önceki iki tasarım da reddedildi:
--   (A) 20260811/12: kapatınca ayrı bir 'kredi' satırı yazılıyordu — "kredi
--       diye bir şey yok, borç var ödeme var sadece" denip kaldırıldı.
--   (B) 20260813090000: orijinal borç satırının KENDİSİ 'odeme'ye
--       dönüştürülüyordu (tek satır) — "işlem ayrı satır, ödeme ayrı satır"
--       denip bu turda geri alındı.
-- Bu migration (C): orijinal borç satırı HİÇ DEĞİŞMİYOR (tur='borc',
-- tutar=orijinal, sonsuza dek görünür kalıyor) — sadece kapatıldığını
-- işaretlemek için kendi odeme_id'si dolduruluyor (idempotency + "Ödendi"
-- rozeti için). Kapatma anında AYRICA yeni bir hasta_bakiye_hareket satırı
-- INSERT ediliyor: tur='odeme', tutar=net (iskonto düşülmüş, fiilen tahsil
-- edilen), odeme_id=aynı ödeme, randevu_id=borcun randevu_id'si (SADECE
-- bakiye formülünün "bu ödeme belirli bir borcu kapatıyor, iskontosuyla
-- birlikte tam karşılığı bakiyeden düşülmeli" sinyali için — ekranda bu
-- satırın İşlem Türü'nde tedavi adı/terapist GÖSTERİLMİYOR, kullanıcı
-- kararıyla "ödemeyi işlemlerle bağdaştırmaya gerek yok").
CREATE OR REPLACE FUNCTION public.hasta_bakiye_hareket_borc_kapat(
  p_hareket_id uuid,
  p_iskonto_tutari numeric,
  p_faturali boolean,
  p_yontem text,
  p_aciklama text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_klinik_id uuid;
  v_hareket hasta_bakiye_hareket%ROWTYPE;
  v_randevu randevu%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_kalem_aciklama text;
  v_kdv_orani numeric := 0;
  v_net_toplam numeric;
  v_odeme_id uuid;
  v_hasta hasta%ROWTYPE;
  v_kimlik_var boolean;
  v_adres_var boolean;
  v_eksikler text[] := '{}';
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_hareket FROM hasta_bakiye_hareket
    WHERE id = p_hareket_id AND klinik_id = v_klinik_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hareket_bulunamadi';
  END IF;

  IF v_hareket.tur <> 'borc' THEN
    RAISE EXCEPTION 'gecersiz_hareket_turu';
  END IF;

  IF v_hareket.odeme_id IS NOT NULL THEN
    RAISE EXCEPTION 'zaten_kapatilmis';
  END IF;

  IF p_iskonto_tutari IS NULL OR p_iskonto_tutari < 0 THEN
    RAISE EXCEPTION 'iskonto_gecersiz';
  END IF;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  IF p_yontem NOT IN ('nakit', 'kredi_karti', 'banka_havalesi') THEN
    RAISE EXCEPTION 'gecersiz_odeme_tipi';
  END IF;

  IF v_hareket.randevu_id IS NOT NULL THEN
    SELECT * INTO v_randevu FROM randevu WHERE id = v_hareket.randevu_id;
    IF FOUND AND v_randevu.islem_tanimi_id IS NOT NULL THEN
      SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
      IF FOUND THEN
        v_kalem_aciklama := v_islem.ad;
        v_kdv_orani := v_islem.kdv_orani;
      END IF;
    END IF;
  END IF;
  v_kalem_aciklama := COALESCE(v_kalem_aciklama, v_hareket.aciklama, 'Borç kapatma');

  SELECT * INTO v_hasta FROM hasta WHERE id = v_hareket.hasta_id;

  IF p_faturali THEN
    SELECT (kimlik_no IS NOT NULL AND kimlik_no <> ''), (adres IS NOT NULL AND adres <> '')
      INTO v_kimlik_var, v_adres_var
      FROM hasta_hassas WHERE hasta_id = v_hareket.hasta_id;

    IF v_hasta.ad_soyad IS NULL OR v_hasta.ad_soyad = '' THEN
      v_eksikler := array_append(v_eksikler, 'ad_soyad');
    END IF;
    IF v_hasta.eposta IS NULL OR v_hasta.eposta = '' THEN
      v_eksikler := array_append(v_eksikler, 'eposta');
    END IF;
    IF NOT COALESCE(v_adres_var, false) THEN
      v_eksikler := array_append(v_eksikler, 'adres');
    END IF;
    IF NOT COALESCE(v_kimlik_var, false) THEN
      v_eksikler := array_append(v_eksikler, 'kimlik_no');
    END IF;

    IF array_length(v_eksikler, 1) > 0 THEN
      RAISE EXCEPTION 'fatura_bilgisi_eksik: %', array_to_string(v_eksikler, ',');
    END IF;
  END IF;

  INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, v_hareket.hasta_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
  RETURNING id INTO v_odeme_id;

  INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani)
  VALUES (v_odeme_id, v_islem.id, v_kalem_aciklama, 1, v_hareket.tutar, v_kdv_orani);

  INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
  VALUES (v_odeme_id, p_yontem, v_net_toplam);

  -- Orijinal borç satırı DEĞİŞMİYOR — sadece kapatıldığını işaretlemek için
  -- kendi odeme_id'si dolduruluyor (idempotency + ekranda "Ödendi" rozeti).
  UPDATE hasta_bakiye_hareket
  SET odeme_id = v_odeme_id
  WHERE id = p_hareket_id;

  -- Ayrı, kalıcı bir "Ödeme" satırı — randevu_id borcunkiyle aynı (SADECE
  -- bakiye formülü bu ödemenin iskontosuyla birlikte tam karşılığını
  -- borçtan düşmesi gerektiğini anlasın diye, ekranda gösterilmiyor).
  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, randevu_id, aciklama)
  VALUES (v_klinik_id, v_hareket.hasta_id, 'odeme', v_net_toplam, v_odeme_id, v_hareket.randevu_id, p_aciklama);

  IF p_faturali THEN
    INSERT INTO fatura (klinik_id, odeme_id, durum)
    VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
  END IF;

  RETURN v_odeme_id;
END;
$function$;

-- Veri düzeltmesi: bir önceki (B) tasarımıyla kapatılmış tek satırlık
-- kayıtları (tur='odeme', randevu_id dolu — Design C'nin "ödeme" satırıyla
-- AYNI şekle sahip) iki satırlı modele geri kur — eksik olan "borç" tarafını
-- (orijinal tutar = mevcut tutar + o ödemenin iskonto_tutari'si) yeniden
-- ekliyoruz, mevcut satıra dokunmuyoruz (zaten Design C'nin ödeme satırıyla
-- birebir eşleşiyor).
INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, randevu_id, aciklama, created_at)
SELECT
  b.klinik_id,
  b.hasta_id,
  'borc',
  b.tutar + o.iskonto_tutari,
  b.odeme_id,
  b.randevu_id,
  b.aciklama,
  b.created_at
FROM hasta_bakiye_hareket b
JOIN odeme o ON o.id = b.odeme_id
WHERE b.tur = 'odeme' AND b.randevu_id IS NOT NULL;
