-- QR Kodları: kartvizit/afiş baskısında okutmayı kolaylaştırmak için statik QR
-- linklerindeki klinik UUID'si (36 karakter) yerine kısa bir kod kullanılıyor.
-- Daha kısa veri → qrcode kütüphanesi daha düşük versiyon/daha seyrek kare
-- deseni seçiyor, küçük baskıda okutması belirgin şekilde kolaylaşıyor.
--
-- Kullanıcı kararı: henüz hiçbir QR basılıp dağıtılmadığı için eski
-- /kayit/hasta/{uuid} gibi rotalar için geriye dönük uyumluluk TUTULMUYOR —
-- rotalar doğrudan kısa koda geçiriliyor (bkz. app/(app)/kayit/hasta/[kisaKod]
-- gibi klasör adı değişiklikleri, aynı PR'da).

ALTER TABLE klinik ADD COLUMN IF NOT EXISTS qr_kisa_kod text UNIQUE;

-- 0/O, 1/l/I gibi karışabilecek karakterler bilinçli çıkarıldı (elle
-- kopyalanıp WhatsApp'tan paylaşılma ihtimaline karşı okunabilirlik).
CREATE OR REPLACE FUNCTION klinik_qr_kisa_kod_uret()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alfabe text := '23456789abcdefghjkmnpqrstuvwxyz';
  kod text;
BEGIN
  LOOP
    kod := '';
    FOR i IN 1..8 LOOP
      kod := kod || substr(alfabe, floor(random() * length(alfabe) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM klinik WHERE qr_kisa_kod = kod);
  END LOOP;
  RETURN kod;
END;
$$;

CREATE OR REPLACE FUNCTION klinik_qr_kisa_kod_varsayilan()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.qr_kisa_kod IS NULL THEN
    NEW.qr_kisa_kod := klinik_qr_kisa_kod_uret();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_klinik_qr_kisa_kod ON klinik;
CREATE TRIGGER trg_klinik_qr_kisa_kod
  BEFORE INSERT ON klinik
  FOR EACH ROW EXECUTE FUNCTION klinik_qr_kisa_kod_varsayilan();

-- Mevcut klinikleri geriye dönük doldur.
UPDATE klinik SET qr_kisa_kod = klinik_qr_kisa_kod_uret() WHERE qr_kisa_kod IS NULL;

ALTER TABLE klinik ALTER COLUMN qr_kisa_kod SET NOT NULL;

-- klinik_qr_bilgisi_getir artık p_klinik_id (uuid) yerine p_kisa_kod (text)
-- alıyor ve id+ad birlikte dönüyor — public form sayfaları tek RPC çağrısıyla
-- hem gerçek klinik_id'yi çözüyor hem klinik adını alıyor. Eski uuid imzalı
-- fonksiyon DROP edilmeli (CREATE OR REPLACE parametre tipi değişince yeni bir
-- overload yaratır, eskisini silmez).
DROP FUNCTION IF EXISTS klinik_qr_bilgisi_getir(uuid);

CREATE OR REPLACE FUNCTION klinik_qr_bilgisi_getir(p_kisa_kod text)
RETURNS TABLE(id uuid, ad text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, ad FROM klinik WHERE qr_kisa_kod = p_kisa_kod;
$$;

GRANT EXECUTE ON FUNCTION klinik_qr_bilgisi_getir(text) TO anon, authenticated;

-- Kontrol:
-- SELECT id, qr_kisa_kod FROM klinik LIMIT 5;
-- SELECT * FROM klinik_qr_bilgisi_getir((SELECT qr_kisa_kod FROM klinik LIMIT 1));
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'klinik_qr_bilgisi_getir'; -- tek satır (text) dönmeli
