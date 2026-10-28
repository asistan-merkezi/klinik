-- Bir önceki migration (20260815090000) SADECE bundan sonraki paket
-- satışlarını borç olarak kaydediyordu. Kullanıcı isteği: "önceden girilmiş
-- olanda değişsin" — yani eski peşin-ödeme davranışıyla (tur='odeme',
-- odeme_id dolu) zaten kaydedilmiş, SADECE paket kalemi içeren (hiç işlem
-- kalemi olmayan) hasta_bakiye_hareket satırları da aynı modele geriye
-- dönük çevriliyor.
--
-- Her aday satır için:
--   - tutar NET'ten (iskonto düşülmüş) BRÜT'e çevriliyor (net + iskonto)
--     — yeni RPC'nin yazdığı borç satırlarıyla aynı biçim.
--   - iskonto_tutari, o satışta zaten girilmiş olan odeme.iskonto_tutari'den
--     aktarılıyor.
--   - faturali=true ise (zaten kesilmiş bir fatura varsa) odeme_id/fatura
--     bağlantısı KORUNUYOR — hasta_bakiye_hareket_borc_duzenle'nin "bu borç
--     zaten faturalandırılmış" dalıyla aynı beklenen durum.
--   - faturali=false ise artık gereksiz olan odeme/odeme_kalemi/odeme_satiri
--     kaydı siliniyor (paket_satis.odeme_id ON DELETE SET NULL ile otomatik
--     boşalıyor), borç satırı odeme_id'siz/bağımsız kalıyor.
DO $$
DECLARE
  v_row record;
  v_gross numeric;
  v_paket_adlari text;
BEGIN
  FOR v_row IN
    SELECT b.id AS hareket_id, b.tutar AS net_tutar, b.aciklama, o.id AS odeme_id, o.iskonto_tutari, o.faturali
    FROM hasta_bakiye_hareket b
    JOIN odeme o ON o.id = b.odeme_id
    WHERE b.tur = 'odeme'
      AND b.odeme_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM odeme_kalemi ok WHERE ok.odeme_id = o.id AND ok.paket_satis_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM odeme_kalemi ok2 WHERE ok2.odeme_id = o.id AND ok2.islem_tanimi_id IS NOT NULL)
  LOOP
    v_gross := v_row.net_tutar + v_row.iskonto_tutari;

    -- Eski davranışta aciklama hep NULL'du, paket adı ekranda odeme_kalemi
    -- üzerinden gösteriliyordu (yeni borç modelinde bu embed yok) — o yüzden
    -- adı burada aciklama'ya taşıyoruz, yeni RPC'nin yaptığıyla aynı.
    SELECT string_agg(p.ad, ', ') INTO v_paket_adlari
      FROM odeme_kalemi ok
      JOIN paket_satis ps ON ps.id = ok.paket_satis_id
      JOIN paket p ON p.id = ps.paket_id
      WHERE ok.odeme_id = v_row.odeme_id;

    IF v_row.faturali THEN
      UPDATE hasta_bakiye_hareket
      SET tur = 'borc', tutar = v_gross, iskonto_tutari = v_row.iskonto_tutari,
          aciklama = COALESCE(NULLIF(v_row.aciklama, ''), v_paket_adlari)
      WHERE id = v_row.hareket_id;
    ELSE
      UPDATE hasta_bakiye_hareket
      SET tur = 'borc', tutar = v_gross, iskonto_tutari = v_row.iskonto_tutari, odeme_id = NULL,
          aciklama = COALESCE(NULLIF(v_row.aciklama, ''), v_paket_adlari)
      WHERE id = v_row.hareket_id;

      DELETE FROM odeme WHERE id = v_row.odeme_id;
    END IF;
  END LOOP;
END $$;

-- Kontrol:
-- SELECT tur, tutar, iskonto_tutari, odeme_id FROM hasta_bakiye_hareket
-- WHERE aciklama = 'Boyun Koparma';
