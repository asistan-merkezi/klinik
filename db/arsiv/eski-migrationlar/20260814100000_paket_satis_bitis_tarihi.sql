-- Paket tanımındaki "Geçerlilik (gün)" alanı "Paket Bitiş Tarihi"ne dönüştürüldü
-- (kullanıcı kararı, 2026-08-14). Artık iki ayrı kavram var:
--   - paket.satis_bitis_tarihi: bu paket TANIMININ satışa açık olduğu son tarih
--     (nullable — boşsa süresiz satılabilir). Hastanın satın aldığı paketin
--     kendisiyle ilgisi yok, sadece "bu paket artık satılamaz" sınırı.
--   - paket_satis (hastanın satın aldığı paket): artık HİÇ tarih bazlı geçerlilik
--     yok — sadece kalan_adet/durum ile takip ediliyor ("paket satın alındıktan
--     sonra paket adet bitiş sayısına bakılır", kullanıcı kararı).
-- paket_satis.gecerlilik_bitis_tarihi kolonu veri kaybı riski almamak için
-- SİLİNMEDİ (eski kayıtlarda tarihi duruyor, salt tarihsel/bilgi amaçlı) ama
-- artık hiçbir sorguda zorunlu/okunan bir alan değil, bu yüzden NOT NULL kaldırıldı.

ALTER TABLE paket ADD COLUMN satis_bitis_tarihi date;

-- ==================== odeme_olustur: paket satışında satış bitiş tarihi kontrolü ====================
-- Paket satın alma artık satis_bitis_tarihi geçmişse reddediliyor; paket_satis
-- insert'inden gecerlilik_bitis_tarihi kaldırıldı (artık hiç yazılmıyor, NULL kalıyor).
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
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif
          AND (satis_bitis_tarihi IS NULL OR satis_bitis_tarihi >= current_date);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO paket_satis (klinik_id, hasta_id, paket_id, odeme_id, kalan_adet)
      VALUES (v_klinik_id, p_hasta_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi)
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

-- ==================== randevu_gelis_isaretle: tarih bazlı geçerlilik kontrolü kaldırıldı ====================
-- Check-in'de geçerli paket araması artık sadece durum='aktif' AND kalan_adet>0
-- bakıyor (tarih filtresi kalktı). Birden fazla aktif paket varsa tüketim sırası
-- artık en eski satın alınan paket önce (ORDER BY satis_tarihi ASC) — önceki
-- "en yakın süresi dolan önce" mantığının yerini alıyor.
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
  ORDER BY ps.satis_tarihi ASC
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

-- ==================== v_hasta_ozet: kalan_paket_hakki artık tarihe bakmıyor ====================
CREATE OR REPLACE VIEW v_hasta_ozet WITH (security_invoker = true) AS
 SELECT m.id AS hasta_id,
    m.klinik_id,
    vas.son_skor AS son_vas_skoru,
    vas.son_tarih AS son_vas_tarihi,
    COALESCE(hedef.aktif_hedef_sayisi, 0::bigint) AS aktif_hedef_sayisi,
    COALESCE(paket.kalan_paket_hakki, 0::bigint) AS kalan_paket_hakki,
    COALESCE(bakiye.bakiye, 0::numeric) AS bakiye,
    seans.son_seans_tarihi,
    jsonb_array_length(COALESCE(m.risk_bayraklari, '[]'::jsonb)) AS aktif_risk_bayrak_sayisi,
    COALESCE(noshow.no_show_sayisi, 0::bigint) AS no_show_sayisi
   FROM hasta m
     LEFT JOIN LATERAL ( SELECT mo.hesaplanan_skor AS son_skor,
            mo.olcum_tarihi AS son_tarih
           FROM hasta_olcum mo
             JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id
          WHERE mo.hasta_id = m.id AND ot.kod = 'VAS'::text
          ORDER BY mo.olcum_tarihi DESC
         LIMIT 1) vas ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS aktif_hedef_sayisi
           FROM hasta_hedef mh
          WHERE mh.hasta_id = m.id AND mh.durum = 'aktif'::text) hedef ON true
     LEFT JOIN LATERAL ( SELECT sum(ps.kalan_adet) AS kalan_paket_hakki
           FROM paket_satis ps
          WHERE ps.hasta_id = m.id AND ps.durum = 'aktif'::text) paket ON true
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN mb.tur = 'kredi'::text THEN mb.tutar
                    WHEN mb.tur = 'borc'::text THEN - (mb.tutar - mb.iskonto_tutari)
                    WHEN mb.tur = 'odeme'::text AND mb.odeme_id IS NULL THEN mb.tutar
                    ELSE 0::numeric
                END) AS bakiye
           FROM hasta_bakiye_hareket mb
          WHERE mb.hasta_id = m.id) bakiye ON true
     LEFT JOIN LATERAL ( SELECT max(r.baslangic) AS son_seans_tarihi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'geldi'::randevu_durum_tipi) seans ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS no_show_sayisi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'gelmedi'::randevu_durum_tipi) noshow ON true;

-- ==================== paket_satis_arsiv_ekle: geçerlilik bitiş tarihi artık zorunlu değil ====================
-- Yeni modelde hastanın paketi tarihe göre değil kalan_adet'e göre takip edildiği
-- için arşiv içe aktarımında da bu alan zorunluluğu kaldırıldı; verilirse (eski
-- programda vardıysa) yine de bilgi amaçlı kaydediliyor, verilmezse NULL kalıyor.
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
      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;

      INSERT INTO paket_satis (
        klinik_id, hasta_id, paket_id, kalan_adet, satis_tarihi, gecerlilik_bitis_tarihi, durum
      ) VALUES (
        v_klinik_id, v_hasta_id, p_paket_id, v_kalan_adet,
        COALESCE(NULLIF(v_kayit->>'satis_tarihi', '')::date, current_date),
        NULLIF(v_kayit->>'gecerlilik_bitis_tarihi', '')::date,
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

-- gecerlilik_gun artık hiçbir yerde okunmuyor/yazılmıyor — kolon kaldırılıyor.
ALTER TABLE paket DROP COLUMN gecerlilik_gun;

-- paket_satis.gecerlilik_bitis_tarihi artık hiçbir INSERT yolunda zorunlu
-- doldurulmuyor (yukarıdaki iki fonksiyon da artık NULL bırakabiliyor) —
-- kolon silinmedi (eski kayıtlarda tarihsel bilgi olarak duruyor) ama NOT NULL
-- kaldırıldı.
ALTER TABLE paket_satis ALTER COLUMN gecerlilik_bitis_tarihi DROP NOT NULL;

-- Kontrol:
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'paket' AND column_name IN ('gecerlilik_gun', 'satis_bitis_tarihi');
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'paket_satis' AND column_name = 'gecerlilik_bitis_tarihi';
-- SELECT pg_get_functiondef('public.odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb)'::regprocedure);
