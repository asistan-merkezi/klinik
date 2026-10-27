-- 0008 (elle yazıldı): canlı olaylar — LISTEN/NOTIFY tetikleyicileri (docs/tasima-plani.md, Modül 2a; Supabase Realtime'ın yerine).
--
-- KVKK/güvenlik kuralı: NOTIFY yükü YALNIZ {t: tablo, i: satır id, k: klinik_id} taşır. Hasta/sağlık verisi, durum, ad, saat gibi
-- hiçbir alan YOKTUR; yük DB'de bile kalıcı değildir ama bu kural yine de geçerlidir (kanal tüm bağlantılara görünür).
-- İstemci olayı aldığında veriyi normal yetkili yoldan (oturum + RLS) yeniden çeker.
--
-- Tek kanal ('canli'); klinik ayrımı yük içindeki k alanıyla dinleyici tarafında yapılır (tenant süzmesi sunucuda, istemciden parametre alınmaz).
-- Tetikleyici fonksiyonu SECURITY INVOKER: pg_notify için ayrıca yetki gerekmez; yazan rolün RLS/yetki denetimi aynen geçerli kalır.
SET search_path = public, extensions;

CREATE FUNCTION canli_olay_bildir() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS
$$
DECLARE
  v_satir record := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  -- klinik_id boş olabilen tablolarda (global kayıt) bildirim gönderilmez: tenant'a atfedilemeyen olay dağıtılamaz.
  IF v_satir.klinik_id IS NOT NULL THEN
    PERFORM pg_notify('canli', json_build_object('t', TG_TABLE_NAME, 'i', v_satir.id, 'k', v_satir.klinik_id)::text);
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION canli_olay_bildir() FROM PUBLIC;

-- İzlenen tablolar (gerçek tüketiciler: randevu çizelgesi, oda tableti, randevu bildirimleri; talepler Bildirimler sayacı için).
-- Tablo eklemek için: buraya tetikleyici + lib/realtime/olay.ts > CANLI_TABLOLAR listesine ekle (iki yer birlikte).
CREATE TRIGGER trg_canli_olay AFTER INSERT OR UPDATE OR DELETE ON randevu
  FOR EACH ROW EXECUTE FUNCTION canli_olay_bildir();
CREATE TRIGGER trg_canli_olay AFTER INSERT OR UPDATE OR DELETE ON randevu_talebi
  FOR EACH ROW EXECUTE FUNCTION canli_olay_bildir();
CREATE TRIGGER trg_canli_olay AFTER INSERT OR UPDATE OR DELETE ON randevu_iptal_talebi
  FOR EACH ROW EXECUTE FUNCTION canli_olay_bildir();
