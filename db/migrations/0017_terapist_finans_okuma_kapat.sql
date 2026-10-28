-- 0017 (elle yazıldı): Modül 4c — terapistin finans tablolarına OKUMA erişimi kapatılır (docs/modul-4b-4c-tasarim.md §4c; 4b'ye DOKUNULMADI).
--
-- Bugüne kadar hasta_bakiye_hareket, odeme, odeme_kalemi, odeme_satiri, fatura ve paket_satis için klinik içindeki HER role SELECT açıktı (terapist dahil).
-- Terapistin bu tablolardan gerçek ihtiyacı yalnız durum bilgisidir ("seans işlendi mi", "pakette kaç hak kaldı"); tutar/yöntem/bakiye görmemelidir.
-- Çözüm: DAR görünümler (yalnız durum/adet, TUTAR YOK) + SELECT politikalarında rol listesi klinik_admin/resepsiyon/muhasebe.
--
-- Görünümler SECURITY INVOKER DEĞİLDİR (sahip = klinik_sahip, FORCE RLS + sahip_aktif_tenant politikası geçerli), ayrıca KENDİ tenant süzgecini taşır
-- (klinik_id = current_klinik_id()) ve yalnız PERSONEL oturumunda satır döndürür (portal hastası current_rol() = NULL → boş). security_barrier: çağıranın
-- WHERE koşulları (ör. randevu_id IN (...)) süzgeçten ÖNCE değerlendirilip satır sızdıramaz.
--
-- Geriye dönük uyum: eski kod yeni şemada ÇÖKMEZ ama terapist oturumunda bu tablolardan boş sonuç alır (paket/işlendi göstergesi) → kod ve migration aynı
-- sürüm paketinde gider (CLAUDE.md migration kuralı); yeni kod terapist için görünümleri kullanır.
SET search_path = public, extensions;

-- ------------------------------------------------------------------ 1) dar görünümler
-- Randevu çizelgesi: "işlem kapanmıştır" durumu + paketli seansın kalan hakkı/adı. TUTAR, YÖNTEM, BAKİYE YOK.
CREATE VIEW v_randevu_kapanis WITH (security_barrier = true) AS
SELECT r.id AS randevu_id,
       r.klinik_id,
       EXISTS (SELECT 1 FROM hasta_bakiye_hareket b WHERE b.randevu_id = r.id AND b.tur = 'borc') AS islendi,
       CASE
         WHEN EXISTS (SELECT 1 FROM hasta_bakiye_hareket b WHERE b.randevu_id = r.id AND b.tur = 'borc') THEN
           CASE WHEN EXISTS (SELECT 1 FROM hasta_bakiye_hareket b WHERE b.randevu_id = r.id AND b.tur = 'odeme') THEN 'tahsil' ELSE 'cariye' END
         WHEN r.paket_satis_id IS NOT NULL THEN 'paketten'
       END AS kapanis_sekli,
       ps.kalan_adet AS paket_kalan_adet,
       p.ad AS paket_ad
  FROM randevu r
  LEFT JOIN paket_satis ps ON ps.id = r.paket_satis_id
  LEFT JOIN paket p ON p.id = ps.paket_id
 WHERE r.klinik_id = (SELECT current_klinik_id())
   AND (SELECT current_rol()) IS NOT NULL;

-- Hasta başına kalan paket hakkı toplamı (hasta listesi/detay özeti). Fiyat/ödeme YOK.
CREATE VIEW v_hasta_paket_ozet WITH (security_barrier = true) AS
SELECT ps.hasta_id,
       ps.klinik_id,
       sum(ps.kalan_adet)::bigint AS kalan_paket_hakki
  FROM paket_satis ps
 WHERE ps.durum = 'aktif'
   AND ps.klinik_id = (SELECT current_klinik_id())
   AND (SELECT current_rol()) IS NOT NULL
 GROUP BY ps.hasta_id, ps.klinik_id;

-- Hastanın aktif paket satışları (randevu formu, hasta listesindeki "kalan/toplam seans"). Fiyat/ödeme YOK; paket adı/seans sayısı `paket` tablosundan.
CREATE VIEW v_hasta_aktif_paket WITH (security_barrier = true) AS
SELECT ps.id AS paket_satis_id,
       ps.hasta_id,
       ps.klinik_id,
       ps.paket_id,
       ps.kalan_adet
  FROM paket_satis ps
 WHERE ps.durum = 'aktif'
   AND ps.klinik_id = (SELECT current_klinik_id())
   AND (SELECT current_rol()) IS NOT NULL;

GRANT SELECT ON v_randevu_kapanis, v_hasta_paket_ozet, v_hasta_aktif_paket TO klinik_uygulama;

-- ------------------------------------------------------------------ 2) v_hasta_ozet: paket hakkı artık dar görünümden (her rol doğru değer görür)
-- bakiye kolonu çağıranın RLS'ine tabi kalır (INVOKER): finans rolleri gerçek bakiyeyi görür, terapist 0 alır (kaynak satırları göremez) ve arayüz göstermez.
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
     LEFT JOIN LATERAL ( SELECT pz.kalan_paket_hakki
           FROM v_hasta_paket_ozet pz
          WHERE pz.hasta_id = m.id) paket ON true
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN mb.tur = 'kredi'::text THEN mb.tutar
                    WHEN mb.tur = 'borc'::text THEN - (mb.tutar - mb.iskonto_tutari)
                    WHEN mb.tur = 'odeme'::text AND mb.odeme_id IS NULL THEN mb.tutar
                    WHEN mb.tur = 'iade'::text AND mb.odeme_id IS NULL THEN - mb.tutar
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

-- ------------------------------------------------------------------ 3) SELECT politikaları: terapist DÜŞER
-- Yeni küme: klinik_admin, resepsiyon, muhasebe (+ super_admin destek bağlamı). Portal politikaları (*_select_portal) AYNEN kalır; yazma politikalarına dokunulmaz.
DROP POLICY odeme_select_klinik ON odeme;
CREATE POLICY odeme_select_klinik ON odeme AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));

DROP POLICY paket_satis_select_klinik ON paket_satis;
CREATE POLICY paket_satis_select_klinik ON paket_satis AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));

DROP POLICY hasta_bakiye_hareket_select_klinik ON hasta_bakiye_hareket;
CREATE POLICY hasta_bakiye_hareket_select_klinik ON hasta_bakiye_hareket AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));

DROP POLICY fatura_select_klinik ON fatura;
CREATE POLICY fatura_select_klinik ON fatura AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((klinik_id = (SELECT current_klinik_id()) AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));

DROP POLICY odeme_kalemi_select_klinik ON odeme_kalemi;
CREATE POLICY odeme_kalemi_select_klinik ON odeme_kalemi AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS (SELECT 1 FROM odeme o WHERE o.id = odeme_kalemi.odeme_id AND o.klinik_id = (SELECT current_klinik_id()))
          AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));

DROP POLICY odeme_satiri_select_klinik ON odeme_satiri;
CREATE POLICY odeme_satiri_select_klinik ON odeme_satiri AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS (SELECT 1 FROM odeme o WHERE o.id = odeme_satiri.odeme_id AND o.klinik_id = (SELECT current_klinik_id()))
          AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))
         OR (SELECT is_super_admin()));
