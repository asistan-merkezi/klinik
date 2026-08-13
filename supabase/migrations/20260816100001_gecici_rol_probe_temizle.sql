-- 20260816100000'daki geçici teşhis fonksiyonunu kaldırır (auth.role() service_role
-- bağlantısında 'service_role' döndüğü doğrulandı — Faz 2 kredi RPC'lerinin
-- auth kontrolü bu teyide dayanıyor).
DROP FUNCTION IF EXISTS _gecici_rol_probe();
