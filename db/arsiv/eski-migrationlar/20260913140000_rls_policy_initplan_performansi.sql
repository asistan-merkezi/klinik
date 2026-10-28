-- RLS policy InitPlan optimizasyonu: current_klinik_id()/current_hasta_id()/
-- current_rol()/is_super_admin() cagrilari satir basina degil sorgu basina bir
-- kez calissin diye (SELECT ...) ile sarildi. Fonksiyonlarin govdesi/davranisi
-- degismedi (hepsi zaten STABLE) -- sadece planlayicinin InitPlan olarak hoist
-- etmesini saglayan sözdizimi eklendi. Idempotent: ALTER POLICY her calistiginda
-- ayni sonucu verir.

BEGIN;

ALTER POLICY "anket_yaniti_select_admin" ON public.anket_yaniti USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "anket_yaniti_update_goruldu" ON public.anket_yaniti USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "audit_log_insert_klinik" ON public.audit_log WITH CHECK (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "audit_log_select_admin" ON public.audit_log USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "cihaz_select_klinik" ON public.cihaz USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "cihaz_yonet_resepsiyon_admin" ON public.cihaz USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "destek_talebi_insert" ON public.destek_talebi WITH CHECK (((kullanici_id = auth.uid()) AND (klinik_id = (SELECT current_klinik_id()))));
ALTER POLICY "destek_talebi_select" ON public.destek_talebi USING (((kullanici_id = auth.uid()) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "destek_talebi_update" ON public.destek_talebi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "egzersiz_kutuphanesi_select" ON public.egzersiz_kutuphanesi USING (((klinik_id = (SELECT current_klinik_id())) OR (klinik_id IS NULL) OR (SELECT is_super_admin())));
ALTER POLICY "egzersiz_kutuphanesi_select_portal" ON public.egzersiz_kutuphanesi USING ((EXISTS ( SELECT 1
   FROM (ev_egzersiz_kalemi ek
     JOIN ev_egzersiz_programi ep ON ((ep.id = ek.program_id)))
  WHERE ((ek.egzersiz_id = egzersiz_kutuphanesi.id) AND (ep.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "egzersiz_kutuphanesi_yonet" ON public.egzersiz_kutuphanesi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_kalemi_select_klinik" ON public.ev_egzersiz_kalemi USING (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = (SELECT current_klinik_id()))))) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_kalemi_select_portal" ON public.ev_egzersiz_kalemi USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "ev_egzersiz_kalemi_yonet_terapist_admin" ON public.ev_egzersiz_kalemi USING (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_programi_select_klinik" ON public.ev_egzersiz_programi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_programi_select_portal" ON public.ev_egzersiz_programi USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "ev_egzersiz_programi_yonet_terapist_admin" ON public.ev_egzersiz_programi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_takip_portal_guncelle" ON public.ev_egzersiz_takip USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = (SELECT current_hasta_id())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "ev_egzersiz_takip_portal_isaretle" ON public.ev_egzersiz_takip WITH CHECK ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "ev_egzersiz_takip_select_klinik" ON public.ev_egzersiz_takip USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "ev_egzersiz_takip_select_portal" ON public.ev_egzersiz_takip USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "ev_egzersiz_takip_yonet_terapist_admin" ON public.ev_egzersiz_takip USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "fatura_ekle_resepsiyon_admin" ON public.fatura WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "fatura_guncelle_resepsiyon_admin" ON public.fatura USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "fatura_select_klinik" ON public.fatura USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_select_klinik" ON public.hasta USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_select_portal" ON public.hasta USING ((id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_update_portal" ON public.hasta USING ((id = (SELECT current_hasta_id()))) WITH CHECK ((id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_update_terapist_risk" ON public.hasta USING (((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'terapist'::kullanici_rol_tipi))) WITH CHECK (((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'terapist'::kullanici_rol_tipi)));
ALTER POLICY "hasta_yonet_resepsiyon_admin" ON public.hasta USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anamnez_ekle" ON public.hasta_anamnez WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anamnez_guncelle" ON public.hasta_anamnez USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anamnez_select_klinik" ON public.hasta_anamnez USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anket_ekle_klinik" ON public.hasta_anket WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anket_portal_yanitla" ON public.hasta_anket USING (((hasta_id = (SELECT current_hasta_id())) AND (cevap_tarihi IS NULL))) WITH CHECK ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_anket_select_klinik" ON public.hasta_anket USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_anket_select_portal" ON public.hasta_anket USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_bakiye_hareket_ekle_resepsiyon_admin" ON public.hasta_bakiye_hareket WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_bakiye_hareket_select_klinik" ON public.hasta_bakiye_hareket USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_bakiye_hareket_select_portal" ON public.hasta_bakiye_hareket USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_belge_ekle_klinik" ON public.hasta_belge WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_belge_guncelle_klinik" ON public.hasta_belge USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_belge_select_klinik" ON public.hasta_belge USING ((((klinik_id = (SELECT current_klinik_id())) AND (deleted_at IS NULL)) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_belge_select_portal" ON public.hasta_belge USING (((hasta_id = (SELECT current_hasta_id())) AND (deleted_at IS NULL)));
ALTER POLICY "hasta_belge_sil_admin" ON public.hasta_belge USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_hassas_insert" ON public.hasta_hassas WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = (SELECT current_hasta_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_hassas_select" ON public.hasta_hassas USING (((klinik_id = (SELECT current_klinik_id())) OR (hasta_id = (SELECT current_hasta_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_hassas_update" ON public.hasta_hassas USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = (SELECT current_hasta_id())) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = (SELECT current_hasta_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_hedef_select_klinik" ON public.hasta_hedef USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_hedef_yonet_terapist_admin" ON public.hasta_hedef USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_iletisim_log_ekle_klinik" ON public.hasta_iletisim_log WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_iletisim_log_select_klinik" ON public.hasta_iletisim_log USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_iliski_select_klinik" ON public.hasta_iliski USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_iliski_yonet_resepsiyon_admin" ON public.hasta_iliski USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_kullanici_select" ON public.hasta_kullanici USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_kullanici_update_klinik" ON public.hasta_kullanici USING (((EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_olcum_select_klinik" ON public.hasta_olcum USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_olcum_yonet_terapist_admin" ON public.hasta_olcum USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_onam_ekle_klinik" ON public.hasta_onam WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_onam_select_klinik" ON public.hasta_onam USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_onam_select_portal" ON public.hasta_onam USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_protokol_select_klinik" ON public.hasta_protokol USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_protokol_select_portal" ON public.hasta_protokol USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_protokol_yonet_terapist_admin" ON public.hasta_protokol USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_sigorta_select" ON public.hasta_sigorta USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_sigorta_yonet_resepsiyon_admin" ON public.hasta_sigorta USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_vucut_haritasi_isareti_select_klinik" ON public.hasta_vucut_haritasi_isareti USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "hasta_vucut_haritasi_isareti_select_portal" ON public.hasta_vucut_haritasi_isareti USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "hasta_vucut_haritasi_isareti_yonet_terapist_admin" ON public.hasta_vucut_haritasi_isareti USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "is_basvurusu_select_admin" ON public.is_basvurusu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "is_basvurusu_update_admin" ON public.is_basvurusu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "iskonto_oranlari_select_klinik" ON public.iskonto_oranlari USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "iskonto_oranlari_yonet_admin" ON public.iskonto_oranlari USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "islem_kategori_select_klinik" ON public.islem_kategori USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "islem_kategori_yonet_admin" ON public.islem_kategori USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "islem_kontrendikasyon_select_klinik" ON public.islem_kontrendikasyon USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "islem_kontrendikasyon_yonet_admin" ON public.islem_kontrendikasyon USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "islem_tanimi_select_klinik" ON public.islem_tanimi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "islem_tanimi_select_portal" ON public.islem_tanimi USING ((EXISTS ( SELECT 1
   FROM (odeme_kalemi ok
     JOIN odeme o ON ((o.id = ok.odeme_id)))
  WHERE ((ok.islem_tanimi_id = islem_tanimi.id) AND (o.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "islem_tanimi_select_portal_katalog" ON public.islem_tanimi USING (((aktif = true) AND (klinik_id = ( SELECT hasta.klinik_id
   FROM hasta
  WHERE (hasta.id = (SELECT current_hasta_id()))))));
ALTER POLICY "islem_tanimi_yonet_admin" ON public.islem_tanimi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "islem_tanimi_fiyat_gecmisi_select_klinik" ON public.islem_tanimi_fiyat_gecmisi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "kamusal_odeme_select" ON public.kamusal_odeme USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "kamusal_odeme_yonet_admin" ON public.kamusal_odeme USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_delete_super_admin" ON public.klinik USING ((SELECT is_super_admin()));
ALTER POLICY "klinik_insert_super_admin" ON public.klinik WITH CHECK ((SELECT is_super_admin()));
ALTER POLICY "klinik_select_kendi" ON public.klinik USING (((id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_update_yetkili" ON public.klinik USING ((((id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_arac_select" ON public.klinik_arac USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_arac_yonet_admin" ON public.klinik_arac USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_ayarlar_select_klinik" ON public.klinik_ayarlar USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_ayarlar_yonet_admin" ON public.klinik_ayarlar USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_banka_hesaplari_select" ON public.klinik_banka_hesaplari USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_banka_hesaplari_yonet" ON public.klinik_banka_hesaplari USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_harcama_select" ON public.klinik_harcama USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_harcama_yonet_admin" ON public.klinik_harcama USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_muhasebe_entegrasyonu_select" ON public.klinik_muhasebe_entegrasyonu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "klinik_muhasebe_entegrasyonu_yonet_admin" ON public.klinik_muhasebe_entegrasyonu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "kullanici_delete_admin" ON public.kullanici USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "kullanici_insert_admin" ON public.kullanici WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "kullanici_select_kendi_klinik" ON public.kullanici USING (((id = auth.uid()) OR (klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "kullanici_update_kendi_veya_admin" ON public.kullanici USING (((id = auth.uid()) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK (((id = auth.uid()) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "mesaj_kredi_hareketleri_select_admin" ON public.mesaj_kredi_hareketleri USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "mesaj_kredileri_select_admin" ON public.mesaj_kredileri USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "mesaj_kurallari_select_admin" ON public.mesaj_kurallari USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "mesaj_kurallari_yonet_admin" ON public.mesaj_kurallari USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "mesaj_kuyrugu_select_admin" ON public.mesaj_kuyrugu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "oda_select_klinik" ON public.oda USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "oda_select_portal" ON public.oda USING ((EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.oda_id = oda.id) AND (r.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "oda_yonet_resepsiyon_admin" ON public.oda USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_select_klinik" ON public.odeme USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_select_portal" ON public.odeme USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "odeme_yonet_resepsiyon_admin" ON public.odeme USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_kalemi_ekle_resepsiyon_admin" ON public.odeme_kalemi WITH CHECK (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_kalemi_select_klinik" ON public.odeme_kalemi USING (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.klinik_id = (SELECT current_klinik_id()))))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_kalemi_select_portal" ON public.odeme_kalemi USING ((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "odeme_satiri_ekle_resepsiyon_admin" ON public.odeme_satiri WITH CHECK (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_satiri_select_klinik" ON public.odeme_satiri USING (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.klinik_id = (SELECT current_klinik_id()))))) OR (SELECT is_super_admin())));
ALTER POLICY "odeme_satiri_select_portal" ON public.odeme_satiri USING ((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "olcek_tanimi_select" ON public.olcek_tanimi USING (((klinik_id = (SELECT current_klinik_id())) OR (klinik_id IS NULL) OR (SELECT is_super_admin())));
ALTER POLICY "olcek_tanimi_yonet" ON public.olcek_tanimi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "paket_select_klinik" ON public.paket USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "paket_select_portal" ON public.paket USING ((EXISTS ( SELECT 1
   FROM paket_satis ps
  WHERE ((ps.paket_id = paket.id) AND (ps.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "paket_yonet_admin" ON public.paket USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "paket_satis_select_klinik" ON public.paket_satis USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "paket_satis_select_portal" ON public.paket_satis USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "paket_satis_yonet_resepsiyon_admin" ON public.paket_satis USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "periyodik_randevu_insert_yetkili" ON public.periyodik_randevu WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "periyodik_randevu_select_klinik" ON public.periyodik_randevu USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "periyodik_randevu_update_resepsiyon_admin" ON public.periyodik_randevu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "personel_select_admin_muhasebe" ON public.personel USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_select_klinik" ON public.personel USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "personel_select_portal" ON public.personel USING ((EXISTS ( SELECT 1
   FROM (terapist t
     JOIN randevu r ON ((r.terapist_id = t.id)))
  WHERE ((t.personel_id = personel.id) AND (r.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "personel_yonet_admin" ON public.personel USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_acil_kisi_delete" ON public.personel_acil_kisi USING (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_acil_kisi_insert" ON public.personel_acil_kisi WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_acil_kisi_select" ON public.personel_acil_kisi USING (((SELECT is_super_admin()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = (SELECT current_klinik_id())) AND (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) OR (p.kullanici_id = auth.uid())))))));
ALTER POLICY "personel_acil_kisi_update" ON public.personel_acil_kisi USING (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = (SELECT current_klinik_id())))))))) WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_hassas_select_admin" ON public.personel_hassas USING (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_hassas_update_admin" ON public.personel_hassas USING (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = (SELECT current_klinik_id())))))))) WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_hassas_upsert_admin" ON public.personel_hassas WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_hesap_hareket_select" ON public.personel_hesap_hareket USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hesap_hareket.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_izin_talebi_select" ON public.personel_izin_talebi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_izin_talebi.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_mesleki_belge_select" ON public.personel_mesleki_belge USING (((SELECT is_super_admin()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = (SELECT current_klinik_id())) AND (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) OR (p.kullanici_id = auth.uid())))))));
ALTER POLICY "personel_mesleki_belge_update" ON public.personel_mesleki_belge USING (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = (SELECT current_klinik_id())))))))) WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_mesleki_belge_upsert" ON public.personel_mesleki_belge WITH CHECK (((SELECT is_super_admin()) OR (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = (SELECT current_klinik_id()))))))));
ALTER POLICY "personel_puantaj_ekle_admin" ON public.personel_puantaj WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND personel_puantaj_donemi_acik_mi(personel_id, tarih)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_puantaj_guncelle_admin" ON public.personel_puantaj USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) AND personel_puantaj_donemi_acik_mi(personel_id, tarih)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_puantaj_select" ON public.personel_puantaj USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_puantaj.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_puantaj_donem_select" ON public.personel_puantaj_donem USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_puantaj_donem.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_ucret_select" ON public.personel_ucret USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_ucret.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "personel_ucret_yonet_admin" ON public.personel_ucret USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_vardiya_atama_ekle_admin" ON public.personel_vardiya_atama WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_vardiya_atama_guncelle_admin" ON public.personel_vardiya_atama USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "personel_vardiya_atama_select" ON public.personel_vardiya_atama USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_vardiya_atama.personel_id) AND (p.kullanici_id = auth.uid())))) OR (SELECT is_super_admin())));
ALTER POLICY "pozisyonlar_insert" ON public.pozisyonlar WITH CHECK (((klinik_id = (SELECT current_klinik_id())) AND (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) OR (SELECT is_super_admin()))));
ALTER POLICY "pozisyonlar_select" ON public.pozisyonlar USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "pozisyonlar_update" ON public.pozisyonlar USING (((klinik_id = (SELECT current_klinik_id())) AND (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) OR (SELECT is_super_admin())))) WITH CHECK (((klinik_id = (SELECT current_klinik_id())) AND (((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi) OR (SELECT is_super_admin()))));
ALTER POLICY "randevu_delete_yetkili" ON public.randevu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_insert_yetkili" ON public.randevu WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_select_klinik" ON public.randevu USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_select_portal" ON public.randevu USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_update_resepsiyon_admin" ON public.randevu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_update_terapist_kendi" ON public.randevu USING (((klinik_id = (SELECT current_klinik_id())) AND (terapist_id IN ( SELECT t.id
   FROM (terapist t
     JOIN personel p ON ((p.id = t.personel_id)))
  WHERE (p.kullanici_id = auth.uid()))))) WITH CHECK ((klinik_id = (SELECT current_klinik_id())));
ALTER POLICY "randevu_checklist_select_klinik" ON public.randevu_checklist USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_checklist_yonet_admin" ON public.randevu_checklist USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_checklist_yonet_terapist_kendi" ON public.randevu_checklist USING (((klinik_id = (SELECT current_klinik_id())) AND (EXISTS ( SELECT 1
   FROM ((randevu r
     JOIN terapist t ON ((t.id = r.terapist_id)))
     JOIN personel p ON ((p.id = t.personel_id)))
  WHERE ((r.id = randevu_checklist.randevu_id) AND (p.kullanici_id = auth.uid())))))) WITH CHECK (((klinik_id = (SELECT current_klinik_id())) AND (EXISTS ( SELECT 1
   FROM ((randevu r
     JOIN terapist t ON ((t.id = r.terapist_id)))
     JOIN personel p ON ((p.id = t.personel_id)))
  WHERE ((r.id = randevu_checklist.randevu_id) AND (p.kullanici_id = auth.uid()))))));
ALTER POLICY "randevu_iptal_talebi_insert_portal" ON public.randevu_iptal_talebi WITH CHECK (((hasta_id = (SELECT current_hasta_id())) AND (EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.id = randevu_iptal_talebi.randevu_id) AND (r.hasta_id = (SELECT current_hasta_id())) AND (r.durum = 'planlandi'::randevu_durum_tipi))))));
ALTER POLICY "randevu_iptal_talebi_select_klinik" ON public.randevu_iptal_talebi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_iptal_talebi_select_portal" ON public.randevu_iptal_talebi USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_iptal_talebi_update_klinik" ON public.randevu_iptal_talebi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_on_form_ekle_klinik" ON public.randevu_on_form WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_on_form_portal_doldur" ON public.randevu_on_form WITH CHECK ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_on_form_select_klinik" ON public.randevu_on_form USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_on_form_select_portal" ON public.randevu_on_form USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_talebi_insert_portal" ON public.randevu_talebi WITH CHECK ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_talebi_select_klinik" ON public.randevu_talebi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "randevu_talebi_select_portal" ON public.randevu_talebi USING ((hasta_id = (SELECT current_hasta_id())));
ALTER POLICY "randevu_talebi_update_klinik" ON public.randevu_talebi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "resmi_tatil_select" ON public.resmi_tatil USING (((klinik_id IS NULL) OR (klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "resmi_tatil_yonet_admin" ON public.resmi_tatil USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "seans_checklist_sablonu_select_klinik" ON public.seans_checklist_sablonu USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "seans_checklist_sablonu_yonet_admin" ON public.seans_checklist_sablonu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "seans_degerlendirme_select_admin" ON public.seans_degerlendirme USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "seans_degerlendirme_update_goruldu" ON public.seans_degerlendirme USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR (SELECT is_super_admin())));
ALTER POLICY "tedavi_protokolu_select_klinik" ON public.tedavi_protokolu USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "tedavi_protokolu_yonet_admin" ON public.tedavi_protokolu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "tedavi_protokolu_adimi_select_klinik" ON public.tedavi_protokolu_adimi USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "tedavi_protokolu_adimi_yonet_admin" ON public.tedavi_protokolu_adimi USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "terapist_select_klinik" ON public.terapist USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "terapist_select_portal" ON public.terapist USING ((EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.terapist_id = terapist.id) AND (r.hasta_id = (SELECT current_hasta_id()))))));
ALTER POLICY "terapist_yonet_admin" ON public.terapist USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));
ALTER POLICY "vardiya_turu_select" ON public.vardiya_turu USING (((klinik_id = (SELECT current_klinik_id())) OR (SELECT is_super_admin())));
ALTER POLICY "vardiya_turu_yonet_admin" ON public.vardiya_turu USING ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin()))) WITH CHECK ((((klinik_id = (SELECT current_klinik_id())) AND ((SELECT current_rol()) = 'klinik_admin'::kullanici_rol_tipi)) OR (SELECT is_super_admin())));

COMMIT;
