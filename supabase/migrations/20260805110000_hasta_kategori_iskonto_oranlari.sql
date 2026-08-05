-- Hasta kategorisi (vita/plus/elit/prime) + klinik bazlı iskonto oranları:
-- ödeme alırken ve randevu check-in'inde (paketsiz borç yazma) tedavi fiyatı
-- artık hastanın kategorisine göre otomatik hesaplanıyor — kademe fiyatı
-- (islem_tanimi.plus/elit/prime_fiyat) override edilmişse o kullanılır, boşsa
-- vita_fiyat üzerinden iskonto_oranlari yüzdesiyle hesaplanır (bkz. önceki
-- migration 20260805100000_islem_tanimi_kademeli_fiyat.sql). Görev tanımındaki
-- "musteri_kategori" ismi — proje 'musteri'yi 'hasta'ya yeniden adlandırmıştı
-- (20260730110000), o yüzden burada hasta.kategori.

-- ==================== 1) hasta.kategori ====================
ALTER TABLE hasta ADD COLUMN IF NOT EXISTS kategori text NOT NULL DEFAULT 'vita'
  CHECK (kategori IN ('vita', 'plus', 'elit', 'prime'));

-- ==================== 2) iskonto_oranlari ====================
-- Klinik başına tek satır — klinik_ayarlar'daki JSONB deseni yerine tipli/
-- kısıtlı ayrı tablo tercih edildi (sabit ve az sayıda alan, CHECK ile 0-100
-- doğrulaması JSONB içinde pratik olmazdı; klinik_ayarlar zaten şema-only ve
-- hiçbir uygulama kodu tarafından kullanılmıyor).
CREATE TABLE IF NOT EXISTS iskonto_oranlari (
  klinik_id uuid PRIMARY KEY REFERENCES klinik(id) ON DELETE CASCADE,
  vita_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (vita_pct >= 0 AND vita_pct <= 100),
  plus_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (plus_pct >= 0 AND plus_pct <= 100),
  elit_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (elit_pct >= 0 AND elit_pct <= 100),
  prime_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (prime_pct >= 0 AND prime_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE iskonto_oranlari ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_iskonto_oranlari_updated_at ON iskonto_oranlari;
CREATE TRIGGER trg_iskonto_oranlari_updated_at BEFORE UPDATE ON iskonto_oranlari
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP POLICY IF EXISTS "iskonto_oranlari_select_klinik" ON iskonto_oranlari;
CREATE POLICY "iskonto_oranlari_select_klinik" ON iskonto_oranlari
  FOR SELECT USING (klinik_id = current_klinik_id() OR is_super_admin());

DROP POLICY IF EXISTS "iskonto_oranlari_yonet_admin" ON iskonto_oranlari;
CREATE POLICY "iskonto_oranlari_yonet_admin" ON iskonto_oranlari
  FOR ALL USING ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin())
  WITH CHECK ((klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin());

-- ==================== 3) Ortak etkin-fiyat helper'ı ====================
-- odeme_olustur ve randevu_gelis_isaretle bu fonksiyonu paylaşır (aynı
-- kademe/iskonto mantığını iki RPC'de ayrı ayrı yazmamak için). Kademe fiyatı
-- (plus/elit/prime_fiyat) girilmişse o esas alınır; girilmemişse vita_fiyat
-- üzerinden ilgili kategori yüzdesiyle hesaplanır. Vita kategorisi her zaman
-- doğrudan vita_fiyat'tır (vita_pct bu hesaba karışmaz — vita zaten master
-- fiyat, Vita % alanı sadece İskonto Oranları ekranında simetri için tutulur).
CREATE OR REPLACE FUNCTION islem_tanimi_etkin_fiyat(p_islem_tanimi_id uuid, p_hasta_id uuid)
RETURNS numeric AS $$
DECLARE
  v_islem islem_tanimi%ROWTYPE;
  v_kategori text;
  v_oranlar iskonto_oranlari%ROWTYPE;
  v_override numeric;
  v_pct numeric;
BEGIN
  SELECT * INTO v_islem FROM islem_tanimi WHERE id = p_islem_tanimi_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT kategori INTO v_kategori FROM hasta WHERE id = p_hasta_id;
  v_kategori := COALESCE(v_kategori, 'vita');

  IF v_kategori = 'vita' THEN
    RETURN v_islem.vita_fiyat;
  END IF;

  v_override := CASE v_kategori
    WHEN 'plus' THEN v_islem.plus_fiyat
    WHEN 'elit' THEN v_islem.elit_fiyat
    WHEN 'prime' THEN v_islem.prime_fiyat
    ELSE NULL
  END;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT * INTO v_oranlar FROM iskonto_oranlari WHERE klinik_id = v_islem.klinik_id;
  v_pct := COALESCE(
    CASE v_kategori
      WHEN 'plus' THEN v_oranlar.plus_pct
      WHEN 'elit' THEN v_oranlar.elit_pct
      WHEN 'prime' THEN v_oranlar.prime_pct
      ELSE NULL
    END, 0
  );

  RETURN round(v_islem.vita_fiyat * (1 - v_pct / 100), 2);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION islem_tanimi_etkin_fiyat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION islem_tanimi_etkin_fiyat(uuid, uuid) TO authenticated, service_role;

-- ==================== 4) odeme_olustur: kademeli fiyata geçiş ====================
-- İşlem kalemi fiyatı artık hastanın kategorisine göre islem_tanimi_etkin_fiyat()
-- ile hesaplanıyor (paket fiyatı bu turda kapsam dışı — görev tanımı sadece
-- tedavi/işlem fiyatlandırmasından bahsediyor, paket.fiyat tek kademeli kalıyor).
CREATE OR REPLACE FUNCTION public.odeme_olustur(p_hasta_id uuid, p_iskonto_tutari numeric, p_faturali boolean, p_aciklama text, p_kalemler jsonb, p_satirlar jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_odeme_id uuid;
  v_kalem jsonb;
  v_satir jsonb;
  v_islem islem_tanimi%ROWTYPE;
  v_paket paket%ROWTYPE;
  v_paket_satis_id uuid;
  v_miktar integer;
  v_fiyat numeric;
  v_kalem_toplam numeric := 0;
  v_satir_toplam numeric := 0;
  v_net_toplam numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'hasta_bulunamadi';
  END IF;

  INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, p_hasta_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
  RETURNING id INTO v_odeme_id;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_miktar := GREATEST(COALESCE((v_kalem->>'miktar')::integer, 1), 1);

    IF v_kalem->>'tur' = 'islem' THEN
      SELECT * INTO v_islem FROM islem_tanimi
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, p_hasta_id);

      INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_islem.id, v_miktar, v_fiyat, v_islem.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_fiyat * v_miktar;

    ELSIF v_kalem->>'tur' = 'paket' THEN
      SELECT * INTO v_paket FROM paket
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO paket_satis (klinik_id, hasta_id, paket_id, odeme_id, kalan_adet, gecerlilik_bitis_tarihi)
      VALUES (v_klinik_id, p_hasta_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi, current_date + v_paket.gecerlilik_gun)
      RETURNING id INTO v_paket_satis_id;

      INSERT INTO odeme_kalemi (odeme_id, paket_satis_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_paket_satis_id, 1, v_paket.fiyat, v_paket.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_paket.fiyat;

    ELSE
      RAISE EXCEPTION 'gecersiz_kalem_turu';
    END IF;
  END LOOP;

  IF v_kalem_toplam = 0 THEN
    RAISE EXCEPTION 'kalem_yok';
  END IF;

  v_net_toplam := v_kalem_toplam - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  FOR v_satir IN SELECT * FROM jsonb_array_elements(p_satirlar)
  LOOP
    INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
    VALUES (v_odeme_id, v_satir->>'yontem', (v_satir->>'tutar')::numeric);

    v_satir_toplam := v_satir_toplam + (v_satir->>'tutar')::numeric;
  END LOOP;

  IF v_satir_toplam <> v_net_toplam THEN
    RAISE EXCEPTION 'odeme_tutari_uyusmuyor';
  END IF;

  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, aciklama)
  VALUES (v_klinik_id, p_hasta_id, 'odeme', v_net_toplam, v_odeme_id, p_aciklama);

  IF p_faturali THEN
    INSERT INTO fatura (klinik_id, odeme_id, durum)
    VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
  END IF;

  RETURN v_odeme_id;
END;
$function$;

-- ==================== 5) randevu_gelis_isaretle: kademeli fiyata geçiş ====================
-- Paketsiz check-in'de yazılan borç tutarı da artık islem_tanimi_etkin_fiyat()
-- ile hesaplanıyor (imza aynı, CREATE OR REPLACE yeterli — grant'ler korunur).
CREATE OR REPLACE FUNCTION public.randevu_gelis_isaretle(p_randevu_id uuid, p_gecikme_dakika integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_yeni_durum randevu_durum_tipi;
  v_paket_satis paket_satis%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_zaten_islendi boolean;
  v_sonuc jsonb;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = auth.uid()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yeni_durum := CASE WHEN p_gecikme_dakika IS NOT NULL THEN 'gecikmeli_geldi' ELSE 'geldi' END;
  UPDATE randevu SET durum = v_yeni_durum, gecikme_dakika = p_gecikme_dakika WHERE id = p_randevu_id;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

  v_zaten_islendi := v_randevu.paket_satis_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc'
  );
  IF v_zaten_islendi THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  SELECT ps.* INTO v_paket_satis
  FROM paket_satis ps
  JOIN paket p ON p.id = ps.paket_id
  WHERE ps.hasta_id = v_randevu.hasta_id
    AND ps.klinik_id = v_randevu.klinik_id
    AND p.islem_tanimi_id = v_randevu.islem_tanimi_id
    AND ps.durum = 'aktif'
    AND ps.kalan_adet > 0
    AND ps.gecerlilik_bitis_tarihi >= current_date
  ORDER BY ps.gecerlilik_bitis_tarihi ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet - 1,
        durum = CASE WHEN kalan_adet - 1 <= 0 THEN 'bitti' ELSE durum END,
        updated_at = now()
    WHERE id = v_paket_satis.id;

    UPDATE randevu SET paket_satis_id = v_paket_satis.id WHERE id = p_randevu_id;

    v_sonuc := jsonb_build_object(
      'yontem', 'paket', 'hasta_id', v_randevu.hasta_id,
      'paket_satis_id', v_paket_satis.id, 'kalan_adet', v_paket_satis.kalan_adet - 1
    );
  ELSE
    SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
    v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, v_randevu.hasta_id);

    INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, randevu_id, aciklama)
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_fiyat, p_randevu_id,
      'Seans ücreti: ' || v_islem.ad ||
        CASE WHEN p_gecikme_dakika IS NOT NULL THEN format(' (gecikmeli geliş, %s dk)', p_gecikme_dakika) ELSE '' END
    );

    v_sonuc := jsonb_build_object(
      'yontem', 'borc', 'hasta_id', v_randevu.hasta_id, 'tutar', v_fiyat, 'islem_adi', v_islem.ad
    );
  END IF;

  RETURN v_sonuc;
END;
$function$;

-- Kontrol:
-- SELECT kategori FROM hasta LIMIT 5;
-- SELECT * FROM iskonto_oranlari;
-- SELECT islem_tanimi_etkin_fiyat(id, (SELECT id FROM hasta LIMIT 1)) FROM islem_tanimi LIMIT 5;
