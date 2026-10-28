-- Düzeltme (aynı gün, canlı testte bulundu): hasta_hassas_insert_qr_kayit
-- policy'si hasta tablosuna doğrudan bir EXISTS alt sorgusuyla bakıyordu, ama
-- bu alt sorgu da current role'ün (anon) RLS SELECT policy'lerine tabi —
-- anon'un hasta üzerinde HİÇBİR SELECT policy'si yok (bilinçli: aksi halde
-- herkes tüm QR-kayıtlı hastaları listeleyebilirdi), bu yüzden EXISTS her
-- zaman 0 satır görüp false dönüyordu ve meşru hasta_hassas insert'leri de
-- reddediliyordu. current_klinik_id() ile aynı desende SECURITY DEFINER bir
-- helper fonksiyona taşındı — bu fonksiyon RLS'i bypass ederek gerçek
-- kontrolü yapıyor, WITH CHECK içinde sadece true/false döndürüyor.
-- İdempotent, tek blok.

CREATE OR REPLACE FUNCTION hasta_qr_self_servis_mi(p_hasta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND kayit_kanali = 'qr_self_servis');
$$;

GRANT EXECUTE ON FUNCTION hasta_qr_self_servis_mi(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "hasta_hassas_insert_qr_kayit" ON hasta_hassas;
CREATE POLICY "hasta_hassas_insert_qr_kayit" ON hasta_hassas
  FOR INSERT TO anon
  WITH CHECK (hasta_qr_self_servis_mi(hasta_id));

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname = 'hasta_qr_self_servis_mi';
-- SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy WHERE polname = 'hasta_hassas_insert_qr_kayit';
