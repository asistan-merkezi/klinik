-- Kullanıcı kararı: manuel "Ödeme Ekle" ile girilen bağımsız bir ödeme artık
-- toplam bakiyeyi GERÇEKTEN azaltmalı (önceden 'odeme' türü hiçbir etki
-- yapmıyordu, sadece bir tahsilat kaydıydı — hasta 500 TL öderse bakiye
-- değişmiyordu, kullanıcı bunu ekran görüntüsüyle bildirdi: "ödeme girilmiş
-- bakiye düşmemiş").
--
-- Bilinçli olarak SADECE bağımsız ödemeler (odeme_id IS NULL — yani
-- hasta_bakiye_hareket'e doğrudan yazılan, herhangi bir odeme/randevu'ya
-- BAĞLI OLMAYAN manuel kayıtlar) etkileniyor:
--   - Borç Kapatma RPC'siyle (hasta_bakiye_hareket_borc_kapat) kapatılan bir
--     borç satırı da tur='odeme'ye dönüşüyor AMA randevu_id/odeme_id dolu —
--     bu satır zaten -tutar (borç) → 0 (eski kural) geçişiyle kendi kendini
--     sıfırlıyordu; o mekanizmaya KESİNLİKLE dokunulmadı (kullanıcı kararı:
--     "borç kapama dialogu aynen kalsın"). Eğer bu satırlara da +tutar etkisi
--     eklenseydi, aynı satır hem borcu (-orijinal_tutar) hem yeni bir alacağı
--     (+net_tutar) saymış olurdu — matematik bozulurdu.
--   - odeme_olustur RPC'sinden gelen (paket/tedavi satın alma, peşin tam
--     ödeme) satırlar da odeme_id dolu — bunlar zaten hiç borç yaratmamıştı,
--     "satın al + öde" nötr bir işlem, +tutar eklemek hayali bir alacak
--     yaratırdı.
-- Bu ayrım Cari & Ödeme ekranındaki lib/hasta/bakiye-hareket-gorunum.ts'teki
-- aynı mantıkla (frontend'te de aynı formül kullanılıyor, guncelBakiye bu
-- view'dan geliyor — ikisi TUTARLI olmalı) birebir eşleşiyor.
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
                    WHEN mb.tur = 'borc'::text THEN - mb.tutar
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
