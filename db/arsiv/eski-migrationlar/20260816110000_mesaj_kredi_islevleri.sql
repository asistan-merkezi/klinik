-- Mesajlaşma FAZ 2 (1/2): atomik kredi düşüm/iade fonksiyonları.
-- Bu iki fonksiyon SADECE service_role bağlantısından çağrılıyor — hem cron
-- worker'ı (/api/cron/mesaj-kuyruk-isle) hem "Test Gönder" server action'ı
-- (kullanıcı yetkisini KENDİSİ, bu fonksiyona gelmeden ÖNCE, trusted server
-- kodunda kontrol ediyor — bkz. lib/mesaj/kuyruk-isle.ts) createAdminClient()
-- (service role) kullanıyor. auth.role()='service_role' kontrolü, gerçek bir
-- geçici teşhis fonksiyonuyla (oluşturulup hemen kaldırıldı, migration
-- 20260816100000/100001) service-role bağlantısında auth.role()'ün gerçekten
-- 'service_role' döndüğü doğrulandıktan sonra yazıldı — is_super_admin()
-- service_role bağlantısında false dönüyor (auth.uid() NULL), bu yüzden o
-- tek başına yeterli değildi.
--
-- İdempotent, tek blok.

CREATE OR REPLACE FUNCTION mesaj_kredi_dus(
  p_klinik_id uuid,
  p_kanal mesaj_kanal_tipi,
  p_kuyruk_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_yeni_bakiye integer;
BEGIN
  IF NOT COALESCE(auth.role() = 'service_role' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE mesaj_kredileri
  SET bakiye = bakiye - 1, updated_at = now()
  WHERE klinik_id = p_klinik_id AND kanal = p_kanal AND bakiye > 0
  RETURNING bakiye INTO v_yeni_bakiye;

  IF v_yeni_bakiye IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO mesaj_kredi_hareketleri (klinik_id, kanal, tip, miktar, kuyruk_id)
  VALUES (p_klinik_id, p_kanal, 'dusum', -1, p_kuyruk_id);

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_kredi_dus(uuid, mesaj_kanal_tipi, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_kredi_dus(uuid, mesaj_kanal_tipi, uuid) TO service_role;

CREATE OR REPLACE FUNCTION mesaj_kredi_iade(
  p_klinik_id uuid,
  p_kanal mesaj_kanal_tipi,
  p_kuyruk_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT COALESCE(auth.role() = 'service_role' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye)
  VALUES (p_klinik_id, p_kanal, 1)
  ON CONFLICT (klinik_id, kanal)
  DO UPDATE SET bakiye = mesaj_kredileri.bakiye + 1, updated_at = now();

  INSERT INTO mesaj_kredi_hareketleri (klinik_id, kanal, tip, miktar, kuyruk_id)
  VALUES (p_klinik_id, p_kanal, 'iade', 1, p_kuyruk_id);
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_kredi_iade(uuid, mesaj_kanal_tipi, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_kredi_iade(uuid, mesaj_kanal_tipi, uuid) TO service_role;

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname IN ('mesaj_kredi_dus','mesaj_kredi_iade');
