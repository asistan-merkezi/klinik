-- ============================================================
-- v_musteri_detay_ozet: Müşteri Detay sayfası mobil hub kart
-- grid'inin (7 kart) tüm özet değerlerini TEK sorguda döndürmek
-- için v_musteri_ozet'i genişletir (sekme başına ayrı sorgu
-- yerine). security_invoker olduğu için alttaki view/tabloların
-- RLS'i sorguyu yapan kullanıcının izinleriyle değerlendirilir.
-- ============================================================
CREATE OR REPLACE VIEW v_musteri_detay_ozet WITH (security_invoker = true) AS
SELECT
  vmo.*,
  randevu.sonraki_randevu_tarihi,
  protokol.aktif_protokol_ad,
  COALESCE(olcum.olcum_sayisi, 0) AS olcum_sayisi,
  COALESCE(belge.belge_sayisi, 0) AS belge_sayisi,
  iletisim.son_iletisim_tarihi
FROM v_musteri_ozet vmo
LEFT JOIN LATERAL (
  SELECT r.baslangic AS sonraki_randevu_tarihi
  FROM randevu r
  WHERE r.musteri_id = vmo.musteri_id AND r.durum = 'planlandi' AND r.baslangic >= now()
  ORDER BY r.baslangic ASC
  LIMIT 1
) randevu ON true
LEFT JOIN LATERAL (
  SELECT it.ad AS aktif_protokol_ad
  FROM musteri_protokol mp
  JOIN islem_tanimi it ON it.id = mp.islem_tanimi_id
  WHERE mp.musteri_id = vmo.musteri_id AND mp.durum = 'aktif'
  ORDER BY mp.baslangic_tarihi DESC
  LIMIT 1
) protokol ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS olcum_sayisi FROM musteri_olcum mo WHERE mo.musteri_id = vmo.musteri_id
) olcum ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS belge_sayisi FROM musteri_belge mb
  WHERE mb.musteri_id = vmo.musteri_id AND mb.is_guncel = true AND mb.deleted_at IS NULL
) belge ON true
LEFT JOIN LATERAL (
  SELECT max(mil.olusturma_tarihi) AS son_iletisim_tarihi FROM musteri_iletisim_log mil
  WHERE mil.musteri_id = vmo.musteri_id
) iletisim ON true;

GRANT SELECT ON v_musteri_detay_ozet TO authenticated;
