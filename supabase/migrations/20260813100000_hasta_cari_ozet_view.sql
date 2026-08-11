-- "Gelirler Takibi > Cari Alacaklar Takibi" ekranı için: hasta başına
-- toplam borçlandırma / tahsil edilen / kalan bakiye özeti.
--
-- hasta_bakiye_hareket ledger'ında bir borç kapatıldığında (bkz.
-- hasta_bakiye_hareket_borc_kapat RPC'si, migration 20260813090000) satırın
-- kendisi tur='borc'tan tur='odeme'ye DÖNÜŞÜYOR (randevu_id korunuyor,
-- ayrı bir satır eklenmiyor) — yani "tahsil edilen" borç kaynaklı ödemeler
-- tur='odeme' AND randevu_id IS NOT NULL ile ayırt edilebiliyor (peşin/tam
-- tahsil edilen normal Ödeme Al akışının ürettiği odeme'ye bağlı ama
-- randevu_id'si NULL olan satırlardan, ve randevu_id'si de NULL olan manuel
-- "Ödeme Ekle" satırlarından farklı olarak).
--
-- Kalan Bakiye = hâlâ açık (tur='borc') satırların toplamı.
-- Tahsil Edilen = kapanmış borç satırlarının (tur='odeme', randevu_id dolu) toplamı.
-- Toplam Bakiye = ikisinin toplamı (hastanın şimdiye kadar oluşan borç hacmi).
--
-- Sadece hiç check-in kaynaklı borcu olmuş (açık veya kapanmış) hastalar
-- listeleniyor — v_hasta_ozet.bakiye'deki gibi kredi/iade türleri burada
-- bilinçli olarak dışarıda (bu ekran özellikle "borç → tahsilat" akışını
-- takip ediyor, genel cari bakiye değil).
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
    COALESCE(sum(b.tutar) FILTER (WHERE b.tur = 'borc'), 0) AS kalan_bakiye,
    COALESCE(sum(b.tutar) FILTER (WHERE b.tur = 'odeme' AND b.randevu_id IS NOT NULL), 0) AS tahsil_edilen
  FROM hasta_bakiye_hareket b
  WHERE b.hasta_id = h.id
) cari ON true
WHERE cari.kalan_bakiye > 0 OR cari.tahsil_edilen > 0;
