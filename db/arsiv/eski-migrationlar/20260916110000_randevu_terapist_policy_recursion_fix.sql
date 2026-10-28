-- Prod'da yakalandı: "Seansı Bitir" (randevuSeansiTamamla, plain .update()) ve
-- randevu üzerindeki diğer doğrudan .update() çağrıları
-- "infinite recursion detected in policy for relation randevu" (42P17) ile
-- başarısız oluyordu — rol fark etmeksizin (klinik_admin dahil), çünkü
-- permissive USING politikaları OR'lanırken randevu_update_terapist_kendi'nin
-- alt sorgusu da her zaman genişletiliyor.
--
-- Kök neden — karşılıklı tablo referansı:
--   randevu_update_terapist_kendi (randevu tablosunda) →
--     terapist JOIN personel WHERE p.kullanici_id = auth.uid()
--     alt sorgusu personel/terapist tablolarının SELECT politikalarını tetikler
--   personel_select_portal / terapist_select_portal →
--     bu politikalar da randevu tablosuna geri sorgu atıyor
--     (r.terapist_id = t.id AND r.hasta_id = current_hasta_id())
-- randevu zaten değerlendirilirken (UPDATE randevu) tekrar randevu'ya
-- dönülmesi Postgres'in döngü koruyucusunu tetikliyor — bkz.
-- docs/TUZAKLAR.md "Policy içindeki EXISTS de çağıranın RLS'ine tabidir →
-- SECURITY DEFINER helper" tuzağı, burada aynı desen personel/terapist
-- portal politikalarıyla randevu arasında oluşmuş.
--
-- Çözüm: randevu_update_terapist_kendi'nin "bu terapist_id giriş yapan
-- kullanıcıya mı ait" kontrolünü SECURITY DEFINER bir helper'a taşımak —
-- helper'ın içindeki sorgu personel/terapist RLS'ini (dolayısıyla
-- personel_select_portal/terapist_select_portal'ın randevu'ya geri
-- sorgusunu) hiç tetiklemiyor, döngü kırılıyor. personel_select_portal ve
-- terapist_select_portal (hasta portalı) kasıtlı olarak DOKUNULMADAN
-- bırakıldı — en dar kapsamlı düzeltme.

CREATE OR REPLACE FUNCTION public.terapist_id_giris_yapan_kullaniciya_ait_mi(p_terapist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM terapist t
    JOIN personel p ON p.id = t.personel_id
    WHERE t.id = p_terapist_id AND p.kullanici_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.terapist_id_giris_yapan_kullaniciya_ait_mi(uuid) TO authenticated;

ALTER POLICY "randevu_update_terapist_kendi" ON public.randevu
  USING (
    (klinik_id = (SELECT current_klinik_id()))
    AND terapist_id_giris_yapan_kullaniciya_ait_mi(terapist_id)
  )
  WITH CHECK (klinik_id = (SELECT current_klinik_id()));

-- Aynı desen randevu_checklist'te de var (kod okumasıyla tespit edildi, bu
-- turda ayrıca prod'da tekrar üretilmedi) — randevu JOIN terapist JOIN
-- personel alt sorgusu, personel_select_portal üzerinden randevu'ya geri
-- dönüyor. randevu'ya JOIN'in kendisi güvenli (randevu'nun SELECT
-- politikaları personel/terapist'e dokunmuyor); riskli olan personel/terapist
-- tablolarına RLS'li erişimdi — aynı helper'la değiştirildi.
ALTER POLICY "randevu_checklist_yonet_terapist_kendi" ON public.randevu_checklist
  USING (
    (klinik_id = (SELECT current_klinik_id()))
    AND EXISTS (
      SELECT 1 FROM randevu r
      WHERE r.id = randevu_checklist.randevu_id
        AND terapist_id_giris_yapan_kullaniciya_ait_mi(r.terapist_id)
    )
  )
  WITH CHECK (
    (klinik_id = (SELECT current_klinik_id()))
    AND EXISTS (
      SELECT 1 FROM randevu r
      WHERE r.id = randevu_checklist.randevu_id
        AND terapist_id_giris_yapan_kullaniciya_ait_mi(r.terapist_id)
    )
  );

-- Kontrol:
-- SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"<klinik_admin-user-id>"}';
-- UPDATE randevu SET tamamlanma_aciklamasi = 'test' WHERE id = '<randevu-id>'; -- artık 42P17 vermemeli
-- INSERT INTO randevu_checklist (...) ...; -- terapist kendi randevusu için de 42P17 vermemeli
