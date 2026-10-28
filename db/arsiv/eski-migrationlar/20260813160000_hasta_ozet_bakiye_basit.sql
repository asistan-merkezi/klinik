-- v_hasta_ozet.bakiye'yi basitleştirilmiş modele göre günceller (migration
-- 20260813150000): borç kapatma "sistemi" yok, iskonto doğrudan borç
-- satırının kendi iskonto_tutari kolonunda. Kural (lib/hasta/bakiye-hareket-gorunum.ts
-- ile AYNI olmalı):
--   kredi                          → +tutar
--   borc                           → -(tutar - iskonto_tutari)
--   odeme, odeme_id NULL (Ödeme Ekle) → +tutar
--   diğer (odeme_olustur'dan peşin satın alma ödemesi) → 0
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
          WHERE ps.hasta_id = m.id AND ps.durum = 'aktif'::text AND ps.gecerlilik_bitis_tarihi >= CURRENT_DATE) paket ON true
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

-- v_hasta_cari_ozet: "borç kapama" ödeme satırı artık hiç oluşmuyor, bu
-- yüzden tahsil_edilen kavramı bu view'da anlamsızlaştı — kalan_bakiye
-- iskonto_tutari düşülerek hesaplanıyor, tahsil_edilen her zaman 0.
CREATE OR REPLACE VIEW v_hasta_cari_ozet WITH (security_invoker = true) AS
SELECT
  h.id AS hasta_id,
  h.klinik_id,
  h.ad_soyad,
  cari.kalan_bakiye,
  0::numeric AS tahsil_edilen,
  cari.kalan_bakiye AS toplam_bakiye
FROM hasta h
JOIN LATERAL (
  SELECT
    COALESCE(sum(b.tutar - b.iskonto_tutari) FILTER (WHERE b.tur = 'borc'), 0) AS kalan_bakiye
  FROM hasta_bakiye_hareket b
  WHERE b.hasta_id = h.id
) cari ON true
WHERE cari.kalan_bakiye > 0;
