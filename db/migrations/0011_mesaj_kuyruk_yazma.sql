-- 0011 (elle yazıldı): kullanıcı isteğinden doğan mesaj olayları (randevu onay/iptal, ödeme alındı, hoş geldin, elle mesaj...) artık servis rolüyle değil
-- kullanıcının KENDİ tenant bağlamıyla kuyruğa yazar (docs/service-role-siniflama.md #8, #23, #25 -> "(b) withTenant").
-- Bunun için iki DAR politika gerekir (başka hiçbir yetki verilmez; kuyruğu İŞLEME/güncelleme yine yalnız sistem bağlamındadır):
--   1) mesaj_kurallari SELECT: klinik rolleri kendi kliniğinin kural satırını okuyabilsin (şablon metni gizli değildir; yönetim/yazma hâlâ yalnız klinik_admin).
--   2) mesaj_kuyrugu INSERT: klinik_admin/resepsiyon/terapist kendi kliniği için satır ekleyebilsin (durum 'beklemede', test_mi=false, deneme 0 zorunlu).
SET search_path = public, extensions;

CREATE POLICY mesaj_kurallari_select_klinik_rolleri ON mesaj_kurallari AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (klinik_id = (SELECT current_klinik_id())
         AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]));

CREATE POLICY mesaj_kuyrugu_insert_klinik_rolleri ON mesaj_kuyrugu AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (klinik_id = (SELECT current_klinik_id())
              AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi])
              AND durum = 'beklemede' AND test_mi = false AND deneme_sayisi = 0);
