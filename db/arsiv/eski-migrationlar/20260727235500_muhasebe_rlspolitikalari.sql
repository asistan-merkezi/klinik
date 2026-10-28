-- muhasebe rolü için yetki genişletmesi.
-- Kapsam (kullanıcı kararı): fatura kesme + personel maaş görüntüleme (payroll
-- raporlama). odeme/paket_satis/odeme_kalemi/odeme_satiri/musteri_bakiye_hareket/
-- islem_tanimi/paket zaten klinik-geneli "select_klinik" politikalarıyla TÜM
-- klinik üyelerine (dolayısıyla muhasebe'ye de) açık — ayrıca dokunulmadı.
-- musteri/musteri_hassas/randevu yönetimi ve personel/kullanıcı yönetimi
-- (klinik_admin'in işi) kasıtlı olarak muhasebe'ye AÇILMADI.

-- 1) Fatura: "Fatura kesme" muhasebenin asıl işi — resepsiyon/admin ile aynı hakları alır.
DROP POLICY IF EXISTS "fatura_ekle_resepsiyon_admin" ON fatura;
CREATE POLICY "fatura_ekle_resepsiyon_admin" ON fatura
  FOR INSERT WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'muhasebe'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "fatura_guncelle_resepsiyon_admin" ON fatura;
CREATE POLICY "fatura_guncelle_resepsiyon_admin" ON fatura
  FOR UPDATE USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'muhasebe'))
    OR is_super_admin()
  )
  WITH CHECK (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'resepsiyon', 'muhasebe'))
    OR is_super_admin()
  );

-- 2) Personel: şu an SADECE klinik_admin görebiliyor (personel_yonet_admin FOR ALL).
-- Muhasebe'ye maaş/bordro raporlama için salt-okunur görünürlük eklenir; terapist/
-- resepsiyon bu tabloya hâlâ hiç erişemez (mevcut gizlilik modeli korunur).
DROP POLICY IF EXISTS "personel_select_admin_muhasebe" ON personel;
CREATE POLICY "personel_select_admin_muhasebe" ON personel
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );

-- 3) Personel ekstra hakediş: aynı mantıkla salt-okunur genişletme.
DROP POLICY IF EXISTS "personel_ekstra_hakedis_select" ON personel_ekstra_hakedis;
CREATE POLICY "personel_ekstra_hakedis_select" ON personel_ekstra_hakedis
  FOR SELECT USING (
    (klinik_id = current_klinik_id() AND current_rol() IN ('klinik_admin', 'muhasebe'))
    OR is_super_admin()
  );
