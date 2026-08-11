-- v_hasta_cari_ozet.kalan_bakiye'yi migration 20260813120000'deki iki-satırlı
-- Borç Kapatma modeliyle tutarlı hale getiriyor: kapatılmış bir borç satırı
-- artık HİÇ değişmiyor (hâlâ tur='borc') — kapandığını ayırt etmek için
-- odeme_id IS NULL şartı eklendi, aksi halde kapatılmış borçlar da "kalan"
-- toplamına sızardı.
CREATE OR REPLACE VIEW v_hasta_cari_ozet WITH (security_invoker = true) AS
SELECT
  h.id AS hasta_id,
  h.klinik_id,
  h.ad_soyad,
  cari.kalan_bakiye,
  cari.tahsil_edilen,
  cari.kalan_bakiye + cari.tahsil_edilen AS toplam_bakiye
FROM hasta h
JOIN LATERAL (
  SELECT
    COALESCE(sum(b.tutar) FILTER (WHERE b.tur = 'borc' AND b.odeme_id IS NULL), 0) AS kalan_bakiye,
    COALESCE(sum(b.tutar) FILTER (WHERE b.tur = 'odeme' AND b.randevu_id IS NOT NULL), 0) AS tahsil_edilen
  FROM hasta_bakiye_hareket b
  WHERE b.hasta_id = h.id
) cari ON true
WHERE cari.kalan_bakiye > 0 OR cari.tahsil_edilen > 0;
