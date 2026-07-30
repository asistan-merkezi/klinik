-- Otomatik üretildi: 'musteri' (customer) teriminin 'hasta' (patient) olarak
-- yeniden adlandırılması. Ürün karar: müşteri değil hasta.
-- Sıra: tablo -> kolon -> constraint/index -> trigger -> policy -> fonksiyon -> view/matview.

-- ==================== 1) TABLOLAR ====================
ALTER TABLE musteri RENAME TO hasta;
ALTER TABLE musteri_anket RENAME TO hasta_anket;
ALTER TABLE musteri_bakiye_hareket RENAME TO hasta_bakiye_hareket;
ALTER TABLE musteri_belge RENAME TO hasta_belge;
ALTER TABLE musteri_hassas RENAME TO hasta_hassas;
ALTER TABLE musteri_hedef RENAME TO hasta_hedef;
ALTER TABLE musteri_iletisim_log RENAME TO hasta_iletisim_log;
ALTER TABLE musteri_iliski RENAME TO hasta_iliski;
ALTER TABLE musteri_kullanici RENAME TO hasta_kullanici;
ALTER TABLE musteri_olcum RENAME TO hasta_olcum;
ALTER TABLE musteri_onam RENAME TO hasta_onam;
ALTER TABLE musteri_protokol RENAME TO hasta_protokol;
ALTER TABLE musteri_sigorta RENAME TO hasta_sigorta;
ALTER TABLE musteri_vucut_haritasi_isareti RENAME TO hasta_vucut_haritasi_isareti;

-- ==================== 2) KOLONLAR ====================
ALTER TABLE ev_egzersiz_programi RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_anket RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_bakiye_hareket RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_belge RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_hassas RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_hedef RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_iletisim_log RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_iliski RENAME COLUMN iliskili_musteri_id TO iliskili_hasta_id;
ALTER TABLE hasta_iliski RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_kullanici RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_olcum RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_onam RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_protokol RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_sigorta RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE odeme RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE paket_satis RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE periyodik_randevu RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE randevu RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE randevu_iptal_talebi RENAME COLUMN musteri_id TO hasta_id;
ALTER TABLE randevu_on_form RENAME COLUMN musteri_id TO hasta_id;

-- ==================== 3) CONSTRAINT'LER ====================
ALTER TABLE ev_egzersiz_programi RENAME CONSTRAINT ev_egzersiz_programi_musteri_id_fkey TO ev_egzersiz_programi_hasta_id_fkey;
ALTER TABLE hasta RENAME CONSTRAINT musteri_cinsiyet_check TO hasta_cinsiyet_check;
ALTER TABLE hasta RENAME CONSTRAINT musteri_klinik_id_fkey TO hasta_klinik_id_fkey;
ALTER TABLE hasta RENAME CONSTRAINT musteri_pkey TO hasta_pkey;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_anket_tipi_check TO hasta_anket_anket_tipi_check;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_klinik_id_fkey TO hasta_anket_klinik_id_fkey;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_musteri_id_fkey TO hasta_anket_hasta_id_fkey;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_pkey TO hasta_anket_pkey;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_puan_check TO hasta_anket_puan_check;
ALTER TABLE hasta_anket RENAME CONSTRAINT musteri_anket_tetikleyici_check TO hasta_anket_tetikleyici_check;
ALTER TABLE hasta_bakiye_hareket RENAME CONSTRAINT musteri_bakiye_hareket_klinik_id_fkey TO hasta_bakiye_hareket_klinik_id_fkey;
ALTER TABLE hasta_bakiye_hareket RENAME CONSTRAINT musteri_bakiye_hareket_musteri_id_fkey TO hasta_bakiye_hareket_hasta_id_fkey;
ALTER TABLE hasta_bakiye_hareket RENAME CONSTRAINT musteri_bakiye_hareket_odeme_id_fkey TO hasta_bakiye_hareket_odeme_id_fkey;
ALTER TABLE hasta_bakiye_hareket RENAME CONSTRAINT musteri_bakiye_hareket_pkey TO hasta_bakiye_hareket_pkey;
ALTER TABLE hasta_bakiye_hareket RENAME CONSTRAINT musteri_bakiye_hareket_tur_check TO hasta_bakiye_hareket_tur_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_asama_check TO hasta_belge_asama_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_dosya_boyut_check TO hasta_belge_dosya_boyut_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_kategori_check TO hasta_belge_kategori_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_kategori_turu_check TO hasta_belge_kategori_turu_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_klinik_foto_onam_check TO hasta_belge_klinik_foto_onam_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_klinik_id_fkey TO hasta_belge_klinik_id_fkey;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_musteri_id_fkey TO hasta_belge_hasta_id_fkey;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_onam_id_fkey TO hasta_belge_onam_id_fkey;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_onceki_belge_id_fkey TO hasta_belge_onceki_belge_id_fkey;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_pkey TO hasta_belge_pkey;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_versiyon_no_check TO hasta_belge_versiyon_no_check;
ALTER TABLE hasta_belge RENAME CONSTRAINT musteri_belge_yukleyen_kullanici_id_fkey TO hasta_belge_yukleyen_kullanici_id_fkey;
ALTER TABLE hasta_hassas RENAME CONSTRAINT musteri_hassas_kimlik_no_tipi_check TO hasta_hassas_kimlik_no_tipi_check;
ALTER TABLE hasta_hassas RENAME CONSTRAINT musteri_hassas_klinik_id_fkey TO hasta_hassas_klinik_id_fkey;
ALTER TABLE hasta_hassas RENAME CONSTRAINT musteri_hassas_musteri_id_fkey TO hasta_hassas_hasta_id_fkey;
ALTER TABLE hasta_hassas RENAME CONSTRAINT musteri_hassas_oncelik_durumu_check TO hasta_hassas_oncelik_durumu_check;
ALTER TABLE hasta_hassas RENAME CONSTRAINT musteri_hassas_pkey TO hasta_hassas_pkey;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_durum_check TO hasta_hedef_durum_check;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_hedef_tipi_check TO hasta_hedef_hedef_tipi_check;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_klinik_id_fkey TO hasta_hedef_klinik_id_fkey;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_musteri_id_fkey TO hasta_hedef_hasta_id_fkey;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_olusturan_id_fkey TO hasta_hedef_olusturan_id_fkey;
ALTER TABLE hasta_hedef RENAME CONSTRAINT musteri_hedef_pkey TO hasta_hedef_pkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_ilgili_randevu_id_fkey TO hasta_iletisim_log_ilgili_randevu_id_fkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_kanal_check TO hasta_iletisim_log_kanal_check;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_klinik_id_fkey TO hasta_iletisim_log_klinik_id_fkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_musteri_id_fkey TO hasta_iletisim_log_hasta_id_fkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_personel_id_fkey TO hasta_iletisim_log_personel_id_fkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_pkey TO hasta_iletisim_log_pkey;
ALTER TABLE hasta_iletisim_log RENAME CONSTRAINT musteri_iletisim_log_yon_check TO hasta_iletisim_log_yon_check;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_check TO hasta_iliski_check;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_iliski_turu_check TO hasta_iliski_iliski_turu_check;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_iliskili_musteri_id_fkey TO hasta_iliski_iliskili_hasta_id_fkey;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_klinik_id_fkey TO hasta_iliski_klinik_id_fkey;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_musteri_id_fkey TO hasta_iliski_hasta_id_fkey;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_musteri_id_iliskili_musteri_id_key TO hasta_iliski_hasta_id_iliskili_hasta_id_key;
ALTER TABLE hasta_iliski RENAME CONSTRAINT musteri_iliski_pkey TO hasta_iliski_pkey;
ALTER TABLE hasta_kullanici RENAME CONSTRAINT musteri_kullanici_id_fkey TO hasta_kullanici_id_fkey;
ALTER TABLE hasta_kullanici RENAME CONSTRAINT musteri_kullanici_musteri_id_fkey TO hasta_kullanici_hasta_id_fkey;
ALTER TABLE hasta_kullanici RENAME CONSTRAINT musteri_kullanici_musteri_id_key TO hasta_kullanici_hasta_id_key;
ALTER TABLE hasta_kullanici RENAME CONSTRAINT musteri_kullanici_pkey TO hasta_kullanici_pkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_giren_kullanici_id_fkey TO hasta_olcum_giren_kullanici_id_fkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_klinik_id_fkey TO hasta_olcum_klinik_id_fkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_musteri_id_fkey TO hasta_olcum_hasta_id_fkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_olcek_tanimi_id_fkey TO hasta_olcum_olcek_tanimi_id_fkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_pkey TO hasta_olcum_pkey;
ALTER TABLE hasta_olcum RENAME CONSTRAINT musteri_olcum_randevu_id_fkey TO hasta_olcum_randevu_id_fkey;
ALTER TABLE hasta_onam RENAME CONSTRAINT musteri_onam_imzalayan_check TO hasta_onam_imzalayan_check;
ALTER TABLE hasta_onam RENAME CONSTRAINT musteri_onam_klinik_id_fkey TO hasta_onam_klinik_id_fkey;
ALTER TABLE hasta_onam RENAME CONSTRAINT musteri_onam_musteri_id_fkey TO hasta_onam_hasta_id_fkey;
ALTER TABLE hasta_onam RENAME CONSTRAINT musteri_onam_olusturan_kullanici_id_fkey TO hasta_onam_olusturan_kullanici_id_fkey;
ALTER TABLE hasta_onam RENAME CONSTRAINT musteri_onam_pkey TO hasta_onam_pkey;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_atayan_terapist_id_fkey TO hasta_protokol_atayan_terapist_id_fkey;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_durum_check TO hasta_protokol_durum_check;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_islem_tanimi_id_fkey TO hasta_protokol_islem_tanimi_id_fkey;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_klinik_id_fkey TO hasta_protokol_klinik_id_fkey;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_musteri_id_fkey TO hasta_protokol_hasta_id_fkey;
ALTER TABLE hasta_protokol RENAME CONSTRAINT musteri_protokol_pkey TO hasta_protokol_pkey;
ALTER TABLE hasta_sigorta RENAME CONSTRAINT musteri_sigorta_check TO hasta_sigorta_check;
ALTER TABLE hasta_sigorta RENAME CONSTRAINT musteri_sigorta_katilim_payi_orani_check TO hasta_sigorta_katilim_payi_orani_check;
ALTER TABLE hasta_sigorta RENAME CONSTRAINT musteri_sigorta_klinik_id_fkey TO hasta_sigorta_klinik_id_fkey;
ALTER TABLE hasta_sigorta RENAME CONSTRAINT musteri_sigorta_musteri_id_fkey TO hasta_sigorta_hasta_id_fkey;
ALTER TABLE hasta_sigorta RENAME CONSTRAINT musteri_sigorta_pkey TO hasta_sigorta_pkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_klinik_id_fkey TO hasta_vucut_haritasi_isareti_klinik_id_fkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_musteri_id_fkey TO hasta_vucut_haritasi_isareti_hasta_id_fkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_olusturan_kullanici_id_fkey TO hasta_vucut_haritasi_isareti_olusturan_kullanici_id_fkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_pkey TO hasta_vucut_haritasi_isareti_pkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_randevu_id_fkey TO hasta_vucut_haritasi_isareti_randevu_id_fkey;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_severity_check TO hasta_vucut_haritasi_isareti_severity_check;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_x_check TO hasta_vucut_haritasi_isareti_x_check;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_y_check TO hasta_vucut_haritasi_isareti_y_check;
ALTER TABLE hasta_vucut_haritasi_isareti RENAME CONSTRAINT musteri_vucut_haritasi_isareti_yuz_check TO hasta_vucut_haritasi_isareti_yuz_check;
ALTER TABLE odeme RENAME CONSTRAINT odeme_musteri_id_fkey TO odeme_hasta_id_fkey;
ALTER TABLE paket_satis RENAME CONSTRAINT paket_satis_musteri_id_fkey TO paket_satis_hasta_id_fkey;
ALTER TABLE periyodik_randevu RENAME CONSTRAINT periyodik_randevu_musteri_id_fkey TO periyodik_randevu_hasta_id_fkey;
ALTER TABLE randevu RENAME CONSTRAINT randevu_musteri_id_fkey TO randevu_hasta_id_fkey;
ALTER TABLE randevu_iptal_talebi RENAME CONSTRAINT randevu_iptal_talebi_musteri_id_fkey TO randevu_iptal_talebi_hasta_id_fkey;
ALTER TABLE randevu_on_form RENAME CONSTRAINT randevu_on_form_musteri_id_fkey TO randevu_on_form_hasta_id_fkey;

-- ==================== 4) BAĞIMSIZ INDEX'LER (constraint-backed olmayan) ====================
ALTER INDEX idx_ev_egzersiz_programi_musteri_id RENAME TO idx_ev_egzersiz_programi_hasta_id;
ALTER INDEX idx_musteri_klinik_id RENAME TO idx_hasta_klinik_id;
ALTER INDEX idx_musteri_telefon RENAME TO idx_hasta_telefon;
ALTER INDEX idx_musteri_anket_klinik_id RENAME TO idx_hasta_anket_klinik_id;
ALTER INDEX idx_musteri_anket_musteri_id RENAME TO idx_hasta_anket_hasta_id;
ALTER INDEX idx_musteri_bakiye_hareket_klinik_id RENAME TO idx_hasta_bakiye_hareket_klinik_id;
ALTER INDEX idx_musteri_bakiye_hareket_musteri_id RENAME TO idx_hasta_bakiye_hareket_hasta_id;
ALTER INDEX idx_musteri_belge_deleted_at RENAME TO idx_hasta_belge_deleted_at;
ALTER INDEX idx_musteri_belge_guncel RENAME TO idx_hasta_belge_guncel;
ALTER INDEX idx_musteri_belge_karsilastirma_grubu RENAME TO idx_hasta_belge_karsilastirma_grubu;
ALTER INDEX idx_musteri_belge_kategori RENAME TO idx_hasta_belge_kategori;
ALTER INDEX idx_musteri_belge_klinik_id RENAME TO idx_hasta_belge_klinik_id;
ALTER INDEX idx_musteri_belge_musteri_id RENAME TO idx_hasta_belge_hasta_id;
ALTER INDEX idx_musteri_hassas_kimlik_no RENAME TO idx_hasta_hassas_kimlik_no;
ALTER INDEX idx_musteri_hassas_klinik_id RENAME TO idx_hasta_hassas_klinik_id;
ALTER INDEX idx_musteri_hedef_klinik_id RENAME TO idx_hasta_hedef_klinik_id;
ALTER INDEX idx_musteri_hedef_musteri_id RENAME TO idx_hasta_hedef_hasta_id;
ALTER INDEX idx_musteri_iletisim_log_klinik_id RENAME TO idx_hasta_iletisim_log_klinik_id;
ALTER INDEX idx_musteri_iletisim_log_musteri_id RENAME TO idx_hasta_iletisim_log_hasta_id;
ALTER INDEX idx_musteri_iliski_klinik_id RENAME TO idx_hasta_iliski_klinik_id;
ALTER INDEX idx_musteri_iliski_musteri_id RENAME TO idx_hasta_iliski_hasta_id;
ALTER INDEX idx_musteri_kullanici_musteri_id RENAME TO idx_hasta_kullanici_hasta_id;
ALTER INDEX idx_musteri_olcum_klinik_id RENAME TO idx_hasta_olcum_klinik_id;
ALTER INDEX idx_musteri_olcum_musteri_id RENAME TO idx_hasta_olcum_hasta_id;
ALTER INDEX idx_musteri_olcum_olcek_id RENAME TO idx_hasta_olcum_olcek_id;
ALTER INDEX idx_musteri_onam_klinik_id RENAME TO idx_hasta_onam_klinik_id;
ALTER INDEX idx_musteri_onam_musteri_id RENAME TO idx_hasta_onam_hasta_id;
ALTER INDEX idx_musteri_protokol_klinik_id RENAME TO idx_hasta_protokol_klinik_id;
ALTER INDEX idx_musteri_protokol_musteri_id RENAME TO idx_hasta_protokol_hasta_id;
ALTER INDEX idx_musteri_sigorta_klinik_id RENAME TO idx_hasta_sigorta_klinik_id;
ALTER INDEX idx_musteri_sigorta_musteri_id RENAME TO idx_hasta_sigorta_hasta_id;
ALTER INDEX idx_musteri_vucut_haritasi_isareti_klinik_id RENAME TO idx_hasta_vucut_haritasi_isareti_klinik_id;
ALTER INDEX idx_musteri_vucut_haritasi_isareti_musteri_id RENAME TO idx_hasta_vucut_haritasi_isareti_hasta_id;
ALTER INDEX idx_mv_musteri_ilerleme_id RENAME TO idx_mv_hasta_ilerleme_id;
ALTER INDEX idx_mv_musteri_ilerleme_musteri_id RENAME TO idx_mv_hasta_ilerleme_hasta_id;
ALTER INDEX idx_odeme_musteri_id RENAME TO idx_odeme_hasta_id;
ALTER INDEX idx_paket_satis_musteri_id RENAME TO idx_paket_satis_hasta_id;
ALTER INDEX idx_periyodik_randevu_musteri_id RENAME TO idx_periyodik_randevu_hasta_id;
ALTER INDEX idx_randevu_musteri_id RENAME TO idx_randevu_hasta_id;

-- ==================== 5) TRIGGER'LAR (isim-only) ====================
ALTER TRIGGER trg_musteri_risk_audit ON hasta RENAME TO trg_hasta_risk_audit;
ALTER TRIGGER trg_musteri_terapist_risk_kisitla ON hasta RENAME TO trg_hasta_terapist_risk_kisitla;
ALTER TRIGGER trg_musteri_updated_at ON hasta RENAME TO trg_hasta_updated_at;
ALTER TRIGGER trg_musteri_anket_updated_at ON hasta_anket RENAME TO trg_hasta_anket_updated_at;
ALTER TRIGGER trg_musteri_belge_audit ON hasta_belge RENAME TO trg_hasta_belge_audit;
ALTER TRIGGER trg_musteri_belge_onam_dogrula ON hasta_belge RENAME TO trg_hasta_belge_onam_dogrula;
ALTER TRIGGER trg_musteri_belge_updated_at ON hasta_belge RENAME TO trg_hasta_belge_updated_at;
ALTER TRIGGER trg_musteri_hassas_klinik_id ON hasta_hassas RENAME TO trg_hasta_hassas_klinik_id;
ALTER TRIGGER trg_musteri_hassas_updated_at ON hasta_hassas RENAME TO trg_hasta_hassas_updated_at;
ALTER TRIGGER trg_musteri_hedef_audit ON hasta_hedef RENAME TO trg_hasta_hedef_audit;
ALTER TRIGGER trg_musteri_hedef_updated_at ON hasta_hedef RENAME TO trg_hasta_hedef_updated_at;
ALTER TRIGGER trg_2_musteri_iliski_dogrula ON hasta_iliski RENAME TO trg_2_hasta_iliski_dogrula;
ALTER TRIGGER trg_musteri_iliski_updated_at ON hasta_iliski RENAME TO trg_hasta_iliski_updated_at;
ALTER TRIGGER trg_musteri_kullanici_updated_at ON hasta_kullanici RENAME TO trg_hasta_kullanici_updated_at;
ALTER TRIGGER trg_musteri_olcum_audit ON hasta_olcum RENAME TO trg_hasta_olcum_audit;
ALTER TRIGGER trg_musteri_onam_audit ON hasta_onam RENAME TO trg_hasta_onam_audit;
ALTER TRIGGER trg_musteri_protokol_audit ON hasta_protokol RENAME TO trg_hasta_protokol_audit;
ALTER TRIGGER trg_musteri_protokol_kontrendikasyon ON hasta_protokol RENAME TO trg_hasta_protokol_kontrendikasyon;
ALTER TRIGGER trg_musteri_protokol_updated_at ON hasta_protokol RENAME TO trg_hasta_protokol_updated_at;
ALTER TRIGGER trg_musteri_sigorta_updated_at ON hasta_sigorta RENAME TO trg_hasta_sigorta_updated_at;
ALTER TRIGGER trg_musteri_vucut_haritasi_isareti_audit ON hasta_vucut_haritasi_isareti RENAME TO trg_hasta_vucut_haritasi_isareti_audit;
ALTER TRIGGER trg_musteri_vucut_haritasi_isareti_updated_at ON hasta_vucut_haritasi_isareti RENAME TO trg_hasta_vucut_haritasi_isareti_updated_at;

-- ==================== 6) TRIGGER'LAR (derive_klinik_id_from_parent argümanlı — drop+recreate) ====================
DROP TRIGGER trg_ev_egzersiz_programi_klinik_id ON ev_egzersiz_programi;
CREATE TRIGGER trg_ev_egzersiz_programi_klinik_id BEFORE INSERT ON ev_egzersiz_programi FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_anket_klinik_id ON hasta_anket;
CREATE TRIGGER trg_hasta_anket_klinik_id BEFORE INSERT ON hasta_anket FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_belge_klinik_id ON hasta_belge;
CREATE TRIGGER trg_hasta_belge_klinik_id BEFORE INSERT ON hasta_belge FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_hedef_klinik_id ON hasta_hedef;
CREATE TRIGGER trg_hasta_hedef_klinik_id BEFORE INSERT ON hasta_hedef FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_iletisim_log_klinik_id ON hasta_iletisim_log;
CREATE TRIGGER trg_hasta_iletisim_log_klinik_id BEFORE INSERT ON hasta_iletisim_log FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_1_musteri_iliski_klinik_id ON hasta_iliski;
CREATE TRIGGER trg_1_hasta_iliski_klinik_id BEFORE INSERT ON hasta_iliski FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_olcum_klinik_id ON hasta_olcum;
CREATE TRIGGER trg_hasta_olcum_klinik_id BEFORE INSERT ON hasta_olcum FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_onam_klinik_id ON hasta_onam;
CREATE TRIGGER trg_hasta_onam_klinik_id BEFORE INSERT ON hasta_onam FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_protokol_klinik_id ON hasta_protokol;
CREATE TRIGGER trg_hasta_protokol_klinik_id BEFORE INSERT ON hasta_protokol FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_sigorta_klinik_id ON hasta_sigorta;
CREATE TRIGGER trg_hasta_sigorta_klinik_id BEFORE INSERT ON hasta_sigorta FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
DROP TRIGGER trg_musteri_vucut_haritasi_isareti_klinik_id ON hasta_vucut_haritasi_isareti;
CREATE TRIGGER trg_hasta_vucut_haritasi_isareti_klinik_id BEFORE INSERT ON hasta_vucut_haritasi_isareti FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');

-- ==================== 7) RLS POLICY'LER ====================
ALTER POLICY "musteri_select_klinik" ON hasta RENAME TO "hasta_select_klinik";
ALTER POLICY "musteri_select_portal" ON hasta RENAME TO "hasta_select_portal";
ALTER POLICY "musteri_update_portal" ON hasta RENAME TO "hasta_update_portal";
ALTER POLICY "musteri_update_terapist_risk" ON hasta RENAME TO "hasta_update_terapist_risk";
ALTER POLICY "musteri_yonet_resepsiyon_admin" ON hasta RENAME TO "hasta_yonet_resepsiyon_admin";
ALTER POLICY "musteri_anket_ekle_klinik" ON hasta_anket RENAME TO "hasta_anket_ekle_klinik";
ALTER POLICY "musteri_anket_portal_yanitla" ON hasta_anket RENAME TO "hasta_anket_portal_yanitla";
ALTER POLICY "musteri_anket_select_klinik" ON hasta_anket RENAME TO "hasta_anket_select_klinik";
ALTER POLICY "musteri_anket_select_portal" ON hasta_anket RENAME TO "hasta_anket_select_portal";
ALTER POLICY "musteri_bakiye_hareket_ekle_resepsiyon_admin" ON hasta_bakiye_hareket RENAME TO "hasta_bakiye_hareket_ekle_resepsiyon_admin";
ALTER POLICY "musteri_bakiye_hareket_select_klinik" ON hasta_bakiye_hareket RENAME TO "hasta_bakiye_hareket_select_klinik";
ALTER POLICY "musteri_bakiye_hareket_select_portal" ON hasta_bakiye_hareket RENAME TO "hasta_bakiye_hareket_select_portal";
ALTER POLICY "musteri_belge_ekle_klinik" ON hasta_belge RENAME TO "hasta_belge_ekle_klinik";
ALTER POLICY "musteri_belge_guncelle_klinik" ON hasta_belge RENAME TO "hasta_belge_guncelle_klinik";
ALTER POLICY "musteri_belge_select_klinik" ON hasta_belge RENAME TO "hasta_belge_select_klinik";
ALTER POLICY "musteri_belge_select_portal" ON hasta_belge RENAME TO "hasta_belge_select_portal";
ALTER POLICY "musteri_belge_sil_admin" ON hasta_belge RENAME TO "hasta_belge_sil_admin";
ALTER POLICY "musteri_hassas_insert" ON hasta_hassas RENAME TO "hasta_hassas_insert";
ALTER POLICY "musteri_hassas_select" ON hasta_hassas RENAME TO "hasta_hassas_select";
ALTER POLICY "musteri_hassas_update" ON hasta_hassas RENAME TO "hasta_hassas_update";
ALTER POLICY "musteri_hedef_select_klinik" ON hasta_hedef RENAME TO "hasta_hedef_select_klinik";
ALTER POLICY "musteri_hedef_yonet_terapist_admin" ON hasta_hedef RENAME TO "hasta_hedef_yonet_terapist_admin";
ALTER POLICY "musteri_iletisim_log_ekle_klinik" ON hasta_iletisim_log RENAME TO "hasta_iletisim_log_ekle_klinik";
ALTER POLICY "musteri_iletisim_log_select_klinik" ON hasta_iletisim_log RENAME TO "hasta_iletisim_log_select_klinik";
ALTER POLICY "musteri_iliski_select_klinik" ON hasta_iliski RENAME TO "hasta_iliski_select_klinik";
ALTER POLICY "musteri_iliski_yonet_resepsiyon_admin" ON hasta_iliski RENAME TO "hasta_iliski_yonet_resepsiyon_admin";
ALTER POLICY "musteri_kullanici_select" ON hasta_kullanici RENAME TO "hasta_kullanici_select";
ALTER POLICY "musteri_kullanici_update_klinik" ON hasta_kullanici RENAME TO "hasta_kullanici_update_klinik";
ALTER POLICY "musteri_olcum_select_klinik" ON hasta_olcum RENAME TO "hasta_olcum_select_klinik";
ALTER POLICY "musteri_olcum_yonet_terapist_admin" ON hasta_olcum RENAME TO "hasta_olcum_yonet_terapist_admin";
ALTER POLICY "musteri_onam_ekle_klinik" ON hasta_onam RENAME TO "hasta_onam_ekle_klinik";
ALTER POLICY "musteri_onam_select_klinik" ON hasta_onam RENAME TO "hasta_onam_select_klinik";
ALTER POLICY "musteri_onam_select_portal" ON hasta_onam RENAME TO "hasta_onam_select_portal";
ALTER POLICY "musteri_protokol_select_klinik" ON hasta_protokol RENAME TO "hasta_protokol_select_klinik";
ALTER POLICY "musteri_protokol_select_portal" ON hasta_protokol RENAME TO "hasta_protokol_select_portal";
ALTER POLICY "musteri_protokol_yonet_terapist_admin" ON hasta_protokol RENAME TO "hasta_protokol_yonet_terapist_admin";
ALTER POLICY "musteri_sigorta_select" ON hasta_sigorta RENAME TO "hasta_sigorta_select";
ALTER POLICY "musteri_sigorta_yonet_resepsiyon_admin" ON hasta_sigorta RENAME TO "hasta_sigorta_yonet_resepsiyon_admin";
ALTER POLICY "musteri_vucut_haritasi_isareti_select_klinik" ON hasta_vucut_haritasi_isareti RENAME TO "hasta_vucut_haritasi_isareti_select_klinik";
ALTER POLICY "musteri_vucut_haritasi_isareti_select_portal" ON hasta_vucut_haritasi_isareti RENAME TO "hasta_vucut_haritasi_isareti_select_portal";
ALTER POLICY "musteri_vucut_haritasi_isareti_yonet_terapist_admin" ON hasta_vucut_haritasi_isareti RENAME TO "hasta_vucut_haritasi_isareti_yonet_terapist_admin";

-- ==================== 8) FONKSİYON İSİMLERİ (ALTER FUNCTION RENAME) ====================
ALTER FUNCTION public.current_musteri_id() RENAME TO current_hasta_id;
ALTER FUNCTION public.musteri_belge_goruntule(p_id uuid) RENAME TO hasta_belge_goruntule;
ALTER FUNCTION public.musteri_belge_onam_dogrula() RENAME TO hasta_belge_onam_dogrula;
ALTER FUNCTION public.musteri_hassas_klinik_id_ata() RENAME TO hasta_hassas_klinik_id_ata;
ALTER FUNCTION public.musteri_iliski_klinik_dogrula() RENAME TO hasta_iliski_klinik_dogrula;
ALTER FUNCTION public.musteri_protokol_kontrendikasyon_kontrol() RENAME TO hasta_protokol_kontrendikasyon_kontrol;
ALTER FUNCTION public.musteri_terapist_sadece_risk_guncelle() RENAME TO hasta_terapist_sadece_risk_guncelle;

-- ==================== 8b) FONKSİYON GÖVDELERİ (musteri/musteri_id metnini içerenler) ====================
CREATE OR REPLACE FUNCTION public.current_hasta_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT hasta_id FROM hasta_kullanici WHERE id = auth.uid() AND aktif = true;
$function$;

CREATE OR REPLACE FUNCTION public.hasta_belge_goruntule(p_id uuid)
 RETURNS hasta_belge
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row hasta_belge%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM hasta_belge WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'belge_bulunamadi';
  END IF;

  IF NOT (
    v_row.klinik_id = current_klinik_id()
    OR v_row.hasta_id = current_hasta_id()
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (
    v_row.klinik_id, auth.uid(), 'select', 'hasta_belge', v_row.id,
    jsonb_build_object('portal_hasta_mi', v_row.hasta_id = current_hasta_id())
  );

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hasta_belge_onam_dogrula()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.onam_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hasta_onam WHERE id = NEW.onam_id AND hasta_id = NEW.hasta_id
  ) THEN
    RAISE EXCEPTION 'onam_hasta_uyusmuyor';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hasta_hassas_klinik_id_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM hasta WHERE id = NEW.hasta_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hasta_iliski_klinik_dogrula()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = NEW.iliskili_hasta_id AND klinik_id = NEW.klinik_id) THEN
    RAISE EXCEPTION 'iliskili_hasta_farkli_klinik';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hasta_protokol_kontrendikasyon_kontrol()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_risk_bayraklari jsonb;
  v_blok_var boolean;
  v_uyari_var boolean;
BEGIN
  SELECT risk_bayraklari INTO v_risk_bayraklari FROM hasta WHERE id = NEW.hasta_id;

  SELECT EXISTS (
    SELECT 1 FROM islem_kontrendikasyon ik
    WHERE ik.islem_tanimi_id = NEW.islem_tanimi_id
      AND ik.uyari_seviyesi = 'blok'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_risk_bayraklari, '[]'::jsonb)) rb
        WHERE rb->>'tip' = ik.risk_tipi
      )
  ) INTO v_blok_var;

  IF v_blok_var THEN
    RAISE EXCEPTION 'kontrendikasyon_blok';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM islem_kontrendikasyon ik
    WHERE ik.islem_tanimi_id = NEW.islem_tanimi_id
      AND ik.uyari_seviyesi = 'uyari'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_risk_bayraklari, '[]'::jsonb)) rb
        WHERE rb->>'tip' = ik.risk_tipi
      )
  ) INTO v_uyari_var;

  IF v_uyari_var AND NOT COALESCE(NEW.uyari_onaylandi_mi, false) THEN
    RAISE EXCEPTION 'kontrendikasyon_uyari_onay_gerekli';
  END IF;

  RETURN NEW;
END;
$function$;

-- odeme_olustur ve randevu_on_form_dogrula: isim aynı kalıyor (musteri içermiyor),
-- sadece içindeki musteri_id/musteri referansları güncelleniyor. p_musteri_id ->
-- p_hasta_id parametre adı değişikliği RPC çağrısında app tarafında da güncellenmeli.
-- Not: Postgres CREATE OR REPLACE ile parametre ADI değiştirilemiyor
-- ("cannot change name of input parameter") — DROP + CREATE gerekiyor;
-- ardından varsayılan ACL'in (anon/authenticated/service_role EXECUTE) aynen
-- korunması için grant'ler açıkça tekrar veriliyor.
DROP FUNCTION public.odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb);
CREATE FUNCTION public.odeme_olustur(p_hasta_id uuid, p_iskonto_tutari numeric, p_faturali boolean, p_aciklama text, p_kalemler jsonb, p_satirlar jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_odeme_id uuid;
  v_kalem jsonb;
  v_satir jsonb;
  v_islem islem_tanimi%ROWTYPE;
  v_paket paket%ROWTYPE;
  v_paket_satis_id uuid;
  v_miktar integer;
  v_kalem_toplam numeric := 0;
  v_satir_toplam numeric := 0;
  v_net_toplam numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'hasta_bulunamadi';
  END IF;

  INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  VALUES (v_klinik_id, p_hasta_id, auth.uid(), p_iskonto_tutari, p_faturali, p_aciklama)
  RETURNING id INTO v_odeme_id;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_miktar := GREATEST(COALESCE((v_kalem->>'miktar')::integer, 1), 1);

    IF v_kalem->>'tur' = 'islem' THEN
      SELECT * INTO v_islem FROM islem_tanimi
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_islem.id, v_miktar, v_islem.fiyat, v_islem.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_islem.fiyat * v_miktar;

    ELSIF v_kalem->>'tur' = 'paket' THEN
      SELECT * INTO v_paket FROM paket
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      INSERT INTO paket_satis (klinik_id, hasta_id, paket_id, odeme_id, kalan_adet, gecerlilik_bitis_tarihi)
      VALUES (v_klinik_id, p_hasta_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi, current_date + v_paket.gecerlilik_gun)
      RETURNING id INTO v_paket_satis_id;

      INSERT INTO odeme_kalemi (odeme_id, paket_satis_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_paket_satis_id, 1, v_paket.fiyat, v_paket.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_paket.fiyat;

    ELSE
      RAISE EXCEPTION 'gecersiz_kalem_turu';
    END IF;
  END LOOP;

  IF v_kalem_toplam = 0 THEN
    RAISE EXCEPTION 'kalem_yok';
  END IF;

  v_net_toplam := v_kalem_toplam - p_iskonto_tutari;
  IF v_net_toplam < 0 THEN
    RAISE EXCEPTION 'iskonto_fazla';
  END IF;

  FOR v_satir IN SELECT * FROM jsonb_array_elements(p_satirlar)
  LOOP
    INSERT INTO odeme_satiri (odeme_id, yontem, tutar)
    VALUES (v_odeme_id, v_satir->>'yontem', (v_satir->>'tutar')::numeric);

    v_satir_toplam := v_satir_toplam + (v_satir->>'tutar')::numeric;
  END LOOP;

  IF v_satir_toplam <> v_net_toplam THEN
    RAISE EXCEPTION 'odeme_tutari_uyusmuyor';
  END IF;

  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, odeme_id, aciklama)
  VALUES (v_klinik_id, p_hasta_id, 'odeme', v_net_toplam, v_odeme_id, p_aciklama);

  IF p_faturali THEN
    INSERT INTO fatura (klinik_id, odeme_id, durum)
    VALUES (v_klinik_id, v_odeme_id, 'bekliyor');
  END IF;

  RETURN v_odeme_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.odeme_olustur(uuid, numeric, boolean, text, jsonb, jsonb) TO anon, authenticated, service_role;

-- portal_giris_epostasi: 'm-' e-posta öneki BİLEREK değiştirilmedi — mevcut
-- portal kullanıcılarının auth.users.email değeri zaten 'm-<uuid>@portal.local'
-- formatında kayıtlı; öneki 'h-' yapmak var olan tüm portal girişlerini kırar.
CREATE OR REPLACE FUNCTION public.portal_giris_epostasi(p_telefon text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'm-' || h.id::text || '@portal.local'
  FROM hasta h
  JOIN hasta_kullanici hk ON hk.hasta_id = h.id
  WHERE h.telefon = p_telefon AND hk.aktif = true
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.randevu_on_form_dogrula()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM randevu WHERE id = NEW.randevu_id AND hasta_id = NEW.hasta_id) THEN
    RAISE EXCEPTION 'hasta_randevu_uyusmuyor';
  END IF;
  RETURN NEW;
END;
$function$;

-- ==================== 9) VIEW'LAR (isim + kolon) ====================
ALTER VIEW v_musteri_detay_ozet RENAME TO v_hasta_detay_ozet;
ALTER VIEW v_hasta_detay_ozet RENAME COLUMN musteri_id TO hasta_id;
ALTER VIEW v_musteri_ilerleme RENAME TO v_hasta_ilerleme;
ALTER VIEW v_hasta_ilerleme RENAME COLUMN musteri_id TO hasta_id;
ALTER VIEW v_musteri_karsilastirma RENAME TO v_hasta_karsilastirma;
ALTER VIEW v_hasta_karsilastirma RENAME COLUMN musteri_id TO hasta_id;
ALTER VIEW v_musteri_ozet RENAME TO v_hasta_ozet;
ALTER VIEW v_hasta_ozet RENAME COLUMN musteri_id TO hasta_id;

-- ==================== 10) MATERIALIZED VIEW ====================
ALTER MATERIALIZED VIEW mv_musteri_ilerleme RENAME TO mv_hasta_ilerleme;
ALTER MATERIALIZED VIEW mv_hasta_ilerleme RENAME COLUMN musteri_id TO hasta_id;