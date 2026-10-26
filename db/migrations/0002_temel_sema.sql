-- OTOMATİK ÜRETİLDİ: db/arac/sema-uret.mjs — elle düzenleme; kuralı değiştir, yeniden üret.
-- Kaynak: 172 migration (supabase/migrations) + supabase/bekleyen/20261003110000_puantaj_pin_kaldir.sql
-- Çalıştıran rol: klinik_sahip (scripts/db-kur.ps1). Önce 0001_kimlik_ve_baglam.sql uygulanmış olmalı.
SET check_function_bodies = off;
SET search_path = public, extensions;

CREATE TYPE kullanici_rol_tipi AS ENUM ('super_admin', 'klinik_admin', 'resepsiyon', 'terapist', 'muhasebe');
CREATE TYPE randevu_durum_tipi AS ENUM ('planlandi', 'geldi', 'iptal', 'gelmedi', 'gecikmeli_geldi', 'ertelendi', 'tamamlandi');
CREATE TYPE mesaj_kanal_tipi AS ENUM ('sms', 'whatsapp', 'mail');
CREATE TYPE mesaj_kredi_hareket_tipi AS ENUM ('yukleme', 'dusum', 'iade');
CREATE TYPE mesaj_kuyruk_durum_tipi AS ENUM ('beklemede', 'gonderiliyor', 'gonderildi', 'hata', 'iptal');
CREATE TYPE mesaj_alici_tipi AS ENUM ('hasta', 'personel');

-- Bağlam fonksiyonları: uygulama her işlemde SET LOCAL app.user_id / app.tenant_id verir (lib/db withTenant).
-- Rol ve portal bağlantısı kullanıcının KENDİ satırından okunur (sahip_kendi_satir politikaları, 0003).
CREATE FUNCTION current_rol() RETURNS kullanici_rol_tipi
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT rol FROM kullanici WHERE id = app_kullanici_id() $$;

CREATE FUNCTION is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT coalesce(current_rol() = 'super_admin', false) $$;

CREATE FUNCTION current_hasta_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT hasta_id FROM hasta_kullanici WHERE id = app_kullanici_id() AND aktif = true $$;


-- ===== Üretilmiş kolonların kullandığı fonksiyonlar (tablolardan önce) =====
CREATE FUNCTION public.personel_puantaj_net_dakika(p_giris timestamp with time zone, p_cikis timestamp with time zone, p_mola integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_giris IS NULL OR p_cikis IS NULL THEN NULL
    ELSE GREATEST(0, (EXTRACT(EPOCH FROM (p_cikis - p_giris)) / 60)::int - COALESCE(p_mola, 0))
  END;
$function$
;

CREATE FUNCTION public.personel_puantaj_planlanan_dakika(p_baslangic time without time zone, p_bitis time without time zone)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_baslangic IS NULL OR p_bitis IS NULL THEN NULL
    ELSE (EXTRACT(EPOCH FROM (p_bitis - p_baslangic)) / 60)::int
      + CASE WHEN p_bitis < p_baslangic THEN 1440 ELSE 0 END -- gece vardiyası (örn. 22:00-06:00) sarması
  END;
$function$
;

CREATE FUNCTION public.personel_puantaj_sapma_dakika(p_giris timestamp with time zone, p_cikis timestamp with time zone, p_mola integer, p_planlanan_baslangic time without time zone, p_planlanan_bitis time without time zone)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT personel_puantaj_net_dakika(p_giris, p_cikis, p_mola)
       - personel_puantaj_planlanan_dakika(p_planlanan_baslangic, p_planlanan_bitis);
$function$
;

CREATE TABLE klinik (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ad text NOT NULL,
  subdomain text,
  plan_turu text DEFAULT 'starter'::text NOT NULL,
  plan_bitis_tarihi date,
  logo_url text,
  marka_renkleri jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  unvan text,
  adres text,
  vergi_dairesi text,
  vergi_no text,
  telefon text,
  whatsapp_no text,
  eposta text,
  yetkili_kisi text,
  yetkili_telefon text,
  yetkili_eposta text,
  il text,
  ilce text,
  mahalle text,
  hafta_ici_baslangic time without time zone,
  hafta_ici_bitis time without time zone,
  cumartesi_baslangic time without time zone,
  cumartesi_bitis time without time zone,
  pazar_baslangic time without time zone,
  pazar_bitis time without time zone,
  logo_url_koyu text,
  qr_kisa_kod text NOT NULL,
  kredi_karti_tahsilat_banka_hesap_id uuid,
  kredi_karti_komisyon_orani numeric(4,2) DEFAULT 0 NOT NULL
);

CREATE TABLE kullanici (
  id uuid NOT NULL,
  klinik_id uuid,
  rol kullanici_rol_tipi NOT NULL,
  ad_soyad text NOT NULL,
  telefon text,
  last_active_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kullanici_id uuid,
  ad_soyad text NOT NULL,
  gorev text NOT NULL,
  maas numeric(12,2),
  ise_giris_tarihi date,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  uzmanlik_tescil_no text,
  adres text,
  il text,
  ilce text,
  mahalle text,
  dogum_tarihi date,
  dogum_yeri text,
  cinsiyet text,
  eposta text,
  departman text,
  calisma_tipi text,
  sgk_sicil_no text,
  ozel_yetki_override jsonb DEFAULT '{}'::jsonb NOT NULL,
  ise_baslama_notu text,
  fm_saatlik_ucret numeric(10,2),
  izin_devir_gun numeric DEFAULT 0 NOT NULL,
  izin_duzeltme_gun numeric DEFAULT 0 NOT NULL,
  pozisyon_id uuid,
  isten_cikis_tarihi date,
  imza_yetkilisi_mi boolean DEFAULT false NOT NULL
);

CREATE TABLE terapist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  maas_hesaplama_modeli text DEFAULT 'sabit'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  prim_sabit_tutar numeric(10,2),
  baraj_seans_sayisi integer,
  baraj_bonus_tutari numeric(10,2)
);

CREATE TABLE hasta (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad_soyad text NOT NULL,
  telefon text NOT NULL,
  dogum_tarihi date,
  kvkk_onay_tarihi timestamp with time zone,
  whatsapp_izin_durumu boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  cinsiyet text,
  eposta text,
  referans_kanali text,
  ozel_nitelikli_veri_onay_tarihi timestamp with time zone,
  ticari_ileti_onay_tarihi timestamp with time zone,
  risk_bayraklari jsonb DEFAULT '[]'::jsonb NOT NULL,
  kvkk_onaylayan_tip text,
  kvkk_onaylayan_kullanici_id uuid,
  ozel_nitelikli_onaylayan_tip text,
  ozel_nitelikli_onaylayan_kullanici_id uuid,
  ticari_ileti_onaylayan_tip text,
  ticari_ileti_onaylayan_kullanici_id uuid,
  kayit_kanali text DEFAULT 'resepsiyon'::text NOT NULL,
  kategori text DEFAULT 'vita'::text NOT NULL,
  olusturan_tip text,
  olusturan_kullanici_id uuid,
  son_guncelleyen_tip text,
  son_guncelleyen_kullanici_id uuid
);

CREATE TABLE oda (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kapasite integer DEFAULT 1 NOT NULL
);

CREATE TABLE cihaz (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  adet integer DEFAULT 1 NOT NULL
);

CREATE TABLE randevu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  terapist_id uuid NOT NULL,
  oda_id uuid NOT NULL,
  cihaz_id uuid,
  baslangic timestamp with time zone NOT NULL,
  bitis timestamp with time zone NOT NULL,
  durum randevu_durum_tipi DEFAULT 'planlandi'::randevu_durum_tipi NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  zaman_araligi tstzrange GENERATED ALWAYS AS (tstzrange(baslangic, bitis, '[)'::text)) STORED,
  olusturan_kullanici_id uuid,
  islem_tanimi_id uuid,
  periyodik_randevu_id uuid,
  paket_satis_id uuid,
  gecikme_dakika integer,
  tani text,
  antrenor_id uuid,
  tedavi_protokolu_id uuid,
  tamamlanma_aciklamasi text,
  tamamlayan_kullanici_id uuid,
  tamamlanma_tarihi timestamp with time zone,
  kaynak text DEFAULT 'uygulama'::text NOT NULL,
  planlanan_iskonto_tutari numeric(10,2),
  iptal_aciklamasi text,
  iptal_tarihi timestamp with time zone,
  iptal_eden_kullanici_id uuid,
  gec_iptal boolean DEFAULT false NOT NULL,
  iptal_paket_dusuldu boolean DEFAULT false NOT NULL,
  bedelli_iptal boolean DEFAULT false NOT NULL,
  iptal_borc_yazildi boolean DEFAULT false NOT NULL
);

CREATE TABLE klinik_ayarlar (
  klinik_id uuid NOT NULL,
  ayarlar jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE islem_kategori (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE islem_tanimi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  islem_kategori_id uuid,
  ad text NOT NULL,
  kdv_orani numeric(5,2) DEFAULT 20 NOT NULL,
  parasut_hizmet_kodu text,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  muhasebe_hizmet_ismi text,
  vita_fiyat numeric(10,2) NOT NULL,
  plus_fiyat numeric(10,2),
  elit_fiyat numeric(10,2),
  prime_fiyat numeric(10,2),
  sure_dakika integer
);

CREATE TABLE paket (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  ad text NOT NULL,
  seans_sayisi integer NOT NULL,
  fiyat numeric(10,2) NOT NULL,
  kdv_orani numeric(5,2) DEFAULT 20 NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  satis_bitis_tarihi date,
  tekrar_sayisi integer DEFAULT 1 NOT NULL,
  kisi_kotasi integer
);

CREATE TABLE odeme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  olusturan_kullanici_id uuid,
  iskonto_tutari numeric(10,2) DEFAULT 0 NOT NULL,
  faturali boolean DEFAULT false NOT NULL,
  aciklama text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE paket_satis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  paket_id uuid NOT NULL,
  odeme_id uuid,
  kalan_adet integer NOT NULL,
  satis_tarihi date DEFAULT CURRENT_DATE NOT NULL,
  gecerlilik_bitis_tarihi date,
  durum text DEFAULT 'aktif'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE odeme_kalemi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  odeme_id uuid NOT NULL,
  islem_tanimi_id uuid,
  paket_satis_id uuid,
  aciklama text,
  miktar integer DEFAULT 1 NOT NULL,
  birim_fiyat numeric(10,2) NOT NULL,
  kdv_orani numeric(5,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE odeme_satiri (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  odeme_id uuid NOT NULL,
  yontem text NOT NULL,
  tutar numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_bakiye_hareket (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  tur text NOT NULL,
  tutar numeric(10,2) NOT NULL,
  odeme_id uuid,
  aciklama text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  randevu_id uuid,
  kaynak text DEFAULT 'uygulama'::text NOT NULL,
  iskonto_tutari numeric DEFAULT 0 NOT NULL,
  iskonto_uygulayan_kullanici_id uuid,
  odeme_yontemi text,
  banka_hesap_id uuid,
  belge_turu text,
  komisyon_orani numeric(4,2)
);

CREATE TABLE fatura (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  odeme_id uuid NOT NULL,
  durum text DEFAULT 'bekliyor'::text NOT NULL,
  parasut_fatura_no text,
  e_arsiv_pdf_url text,
  hata_mesaji text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_kullanici (
  id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE randevu_iptal_talebi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  randevu_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  durum text DEFAULT 'bekliyor'::text NOT NULL,
  yanit_kullanici_id uuid,
  yanit_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  aciklama text,
  gec_iptal boolean DEFAULT false NOT NULL
);

CREATE TABLE hasta_hassas (
  hasta_id uuid NOT NULL,
  klinik_id uuid NOT NULL,
  kimlik_no text,
  kimlik_no_tipi text,
  adres text,
  acil_durum_ad_soyad text,
  acil_durum_yakinlik text,
  acil_durum_telefon text,
  kronik_hastaliklar text,
  surekli_ilaclar text,
  alerjiler text,
  gecirilmis_ameliyatlar text,
  gelis_sebebi text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kan_sulandirici_kullanimi boolean DEFAULT false,
  alerji_var boolean,
  kronik_hastalik_var boolean,
  surekli_ilac_var boolean,
  ameliyat_var boolean,
  kan_sulandirici_detay text,
  bulasici_hastalik_var boolean,
  bulasici_hastalik_detay text,
  protez_implant_var boolean,
  protez_implant_detay text,
  hamilelik_emzirme_var boolean,
  hamilelik_emzirme_detay text,
  sigara_alkol_madde_var boolean,
  sigara_alkol_madde_detay text,
  oncelik_durumu text DEFAULT 'normal'::text NOT NULL,
  il text,
  ilce text,
  mahalle text,
  anne_adi text,
  anne_telefon text,
  baba_adi text,
  baba_telefon text,
  diger_yakini_ad_soyad text,
  diger_yakini_telefon text,
  diger_yakini_yakinlik text,
  olusturan_tip text,
  olusturan_kullanici_id uuid,
  son_guncelleyen_tip text,
  son_guncelleyen_kullanici_id uuid
);

CREATE TABLE klinik_muhasebe_entegrasyonu (
  klinik_id uuid NOT NULL,
  parasut_client_id text,
  parasut_client_secret text,
  parasut_company_id text,
  baglanti_durumu text DEFAULT 'bekliyor'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE periyodik_randevu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  terapist_id uuid NOT NULL,
  oda_id uuid NOT NULL,
  cihaz_id uuid,
  islem_tanimi_id uuid NOT NULL,
  haftanin_gunu smallint NOT NULL,
  saat time without time zone NOT NULL,
  sure_dakika integer DEFAULT 30 NOT NULL,
  durum text DEFAULT 'aktif'::text NOT NULL,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  bitis_tarihi date,
  otomatik_yenile boolean DEFAULT true NOT NULL
);

CREATE TABLE islem_kontrendikasyon (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  risk_tipi text NOT NULL,
  uyari_seviyesi text NOT NULL,
  mesaj text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_hedef (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  hedef_tipi text NOT NULL,
  hedef_metrik text NOT NULL,
  baslangic_deger numeric(10,2),
  hedef_deger numeric(10,2),
  hedef_tarihi date,
  durum text DEFAULT 'aktif'::text NOT NULL,
  olusturan_id uuid,
  notlar text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE olcek_tanimi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  kod text NOT NULL,
  ad text NOT NULL,
  soru_semasi jsonb DEFAULT '[]'::jsonb NOT NULL,
  skorlama_kurali jsonb DEFAULT '{}'::jsonb NOT NULL,
  min_skor numeric(6,2),
  max_skor numeric(6,2),
  yorum_yonu text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_olcum (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  randevu_id uuid,
  olcek_tanimi_id uuid NOT NULL,
  cevaplar jsonb DEFAULT '{}'::jsonb NOT NULL,
  hesaplanan_skor numeric(6,2),
  olcum_tarihi timestamp with time zone DEFAULT now() NOT NULL,
  giren_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE egzersiz_kutuphanesi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  ad text NOT NULL,
  aciklama text,
  bolge text,
  video_url text,
  gorsel_url text,
  varsayilan_set integer,
  varsayilan_tekrar integer,
  varsayilan_sure_sn integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ev_egzersiz_programi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  ad text NOT NULL,
  baslangic_tarihi date DEFAULT CURRENT_DATE NOT NULL,
  bitis_tarihi date,
  atayan_terapist_id uuid,
  durum text DEFAULT 'aktif'::text NOT NULL,
  notlar text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ev_egzersiz_kalemi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  program_id uuid NOT NULL,
  egzersiz_id uuid NOT NULL,
  set integer,
  tekrar integer,
  sure_sn integer,
  gun_sikligi text,
  sira integer DEFAULT 1 NOT NULL,
  ozel_not text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ev_egzersiz_takip (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  program_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  tarih date DEFAULT CURRENT_DATE NOT NULL,
  yapildi boolean DEFAULT false NOT NULL,
  hasta_notu text,
  agri_skoru integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seans_checklist_sablonu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  maddeler jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE randevu_checklist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  randevu_id uuid NOT NULL,
  sablon_id uuid NOT NULL,
  cevaplar jsonb DEFAULT '{}'::jsonb NOT NULL,
  tamamlanma_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_iletisim_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  kanal text NOT NULL,
  yon text NOT NULL,
  icerik text,
  ilgili_randevu_id uuid,
  personel_id uuid,
  olusturma_tarihi timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_anket (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  anket_tipi text NOT NULL,
  tetikleyici text,
  puan integer,
  yorum text,
  gonderim_tarihi timestamp with time zone DEFAULT now() NOT NULL,
  cevap_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE randevu_on_form (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  randevu_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  agri_skoru integer,
  sikayet_guncelleme text,
  ilac_degisikligi text,
  doldurma_tarihi timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_iliski (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  iliskili_hasta_id uuid NOT NULL,
  iliski_turu text NOT NULL,
  ortak_odeme boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_sigorta (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  kurum_adi text NOT NULL,
  police_no text,
  katilim_payi_orani numeric(5,2),
  gecerlilik_baslangic date,
  gecerlilik_bitis date,
  fatura_kurum_adina boolean DEFAULT false NOT NULL,
  notlar text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_belge (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  belge_turu text NOT NULL,
  storage_path text NOT NULL,
  upload_tarihi timestamp with time zone DEFAULT now() NOT NULL,
  yukleyen_kullanici_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_encrypted boolean DEFAULT false NOT NULL,
  versiyon_no integer DEFAULT 1 NOT NULL,
  onceki_belge_id uuid,
  is_guncel boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  kategori text NOT NULL,
  bolge text,
  cekim_tarihi date DEFAULT CURRENT_DATE NOT NULL,
  karsilastirma_grubu_id uuid,
  asama text,
  onam_id uuid,
  thumbnail_path text,
  dosya_mime text,
  dosya_boyut_byte bigint,
  exif_temizlendi boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE hasta_onam (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  onam_tipi text NOT NULL,
  imzalayan text DEFAULT 'hasta'::text NOT NULL,
  imza_storage_path text,
  olusturan_kullanici_id uuid,
  imza_tarihi timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_vucut_haritasi_isareti (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  randevu_id uuid,
  bolge text NOT NULL,
  x numeric(5,4),
  y numeric(5,4),
  severity integer,
  not_metni text,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  yuz text NOT NULL
);

CREATE TABLE hasta_protokol (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  atayan_terapist_id uuid,
  durum text DEFAULT 'aktif'::text NOT NULL,
  baslangic_tarihi date DEFAULT CURRENT_DATE NOT NULL,
  notlar text,
  uyari_onaylandi_mi boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_harcama (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kategori text NOT NULL,
  tutar numeric(12,2) NOT NULL,
  tarih date NOT NULL,
  aciklama text,
  is_faturali boolean DEFAULT false NOT NULL,
  fatura_no text,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tedarikci_adi text,
  arac_id uuid,
  odeme_tipi text,
  banka_hesap_id uuid,
  kredi_karti_id uuid
);

CREATE TABLE personel_hassas (
  personel_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tc_kimlik text,
  pasaport_no text
);

CREATE TABLE personel_acil_kisi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  personel_id uuid NOT NULL,
  ad_soyad text NOT NULL,
  yakinlik text NOT NULL,
  telefon text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_mesleki_belge (
  personel_id uuid NOT NULL,
  diploma_no text,
  uzmanlik_belge_no text,
  meslek_odasi_sicil_no text,
  saglik_bakanligi_tescil_no text,
  e_imza_sertifika_seri_no text,
  e_imza_gecerlilik_tarihi date,
  kase_gorsel_url text,
  mali_sorumluluk_sigorta_police_no text,
  mali_sorumluluk_sigorta_bitis_tarihi date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE tedavi_protokolu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  aciklama text,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE tedavi_protokolu_adimi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tedavi_protokolu_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  sira integer NOT NULL,
  adim_notu text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE is_basvurusu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad_soyad text NOT NULL,
  telefon text NOT NULL,
  eposta text,
  pozisyon text,
  mesaj text,
  durum text DEFAULT 'beklemede'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dogum_tarihi date,
  tc_kimlik_no text,
  adres text,
  bizi_nereden_duydunuz text,
  calismaya_baslama_tarihi date,
  calisma_sekli text,
  beklenen_ucret text,
  egitim_okul_bolum text,
  egitim_mezuniyet_yili text,
  egitim_sertifikalar text,
  is_deneyimi jsonb DEFAULT '[]'::jsonb NOT NULL,
  referanslar jsonb DEFAULT '[]'::jsonb NOT NULL,
  kvkk_onay boolean DEFAULT false NOT NULL,
  kvkk_onay_tarihi timestamp with time zone,
  degerlendiren_kullanici_id uuid,
  degerlendirme_tarihi timestamp with time zone,
  personel_id uuid
);

CREATE TABLE anket_yaniti (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  puan smallint,
  oneri_metni text,
  ad_soyad text,
  telefon text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  goruldu_tarihi timestamp with time zone
);

CREATE TABLE islem_tanimi_fiyat_gecmisi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  klinik_id uuid NOT NULL,
  vita_fiyat numeric(10,2) NOT NULL,
  plus_fiyat numeric(10,2),
  elit_fiyat numeric(10,2),
  prime_fiyat numeric(10,2),
  kdv_orani numeric(5,2) NOT NULL,
  gecerlilik_baslangic timestamp with time zone DEFAULT now() NOT NULL,
  gecerlilik_bitis timestamp with time zone,
  degistiren_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE iskonto_oranlari (
  klinik_id uuid NOT NULL,
  vita_pct numeric(5,2) DEFAULT 0 NOT NULL,
  plus_pct numeric(5,2) DEFAULT 0 NOT NULL,
  elit_pct numeric(5,2) DEFAULT 0 NOT NULL,
  prime_pct numeric(5,2) DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE vardiya_turu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  baslangic_saat time without time zone NOT NULL,
  bitis_saat time without time zone NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_vardiya_atama (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  vardiya_turu_id uuid NOT NULL,
  haftanin_gunu smallint NOT NULL,
  gecerlilik_baslangic date DEFAULT CURRENT_DATE NOT NULL,
  gecerlilik_bitis date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_puantaj_donem (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  yil integer NOT NULL,
  ay integer NOT NULL,
  durum text DEFAULT 'acik'::text NOT NULL,
  snapshot_net_saat numeric(8,2),
  snapshot_onayli_fm_saat numeric(8,2),
  snapshot_eksik_saat numeric(8,2),
  snapshot_izin_gun integer,
  snapshot_devamsizlik_gun integer,
  kapatan_id uuid,
  kapatma_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_puantaj (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  tarih date NOT NULL,
  planlanan_baslangic time without time zone,
  planlanan_bitis time without time zone,
  giris_saat timestamp with time zone,
  cikis_saat timestamp with time zone,
  mola_dakika integer DEFAULT 0 NOT NULL,
  net_calisma_dakika integer GENERATED ALWAYS AS (personel_puantaj_net_dakika(giris_saat, cikis_saat, mola_dakika)) STORED,
  sapma_dakika integer GENERATED ALWAYS AS (personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis)) STORED,
  fazla_mesai_dakika integer GENERATED ALWAYS AS (
CASE
    WHEN (personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL) THEN NULL::integer
    ELSE GREATEST(personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis), 0)
END) STORED,
  eksik_calisma_dakika integer GENERATED ALWAYS AS (
CASE
    WHEN (personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis) IS NULL) THEN NULL::integer
    ELSE GREATEST((- personel_puantaj_sapma_dakika(giris_saat, cikis_saat, mola_dakika, planlanan_baslangic, planlanan_bitis)), 0)
END) STORED,
  fm_onay_durumu text DEFAULT 'bekliyor'::text NOT NULL,
  fm_onaylayan_id uuid,
  fm_onay_tarihi timestamp with time zone,
  durum text NOT NULL,
  kaynak text DEFAULT 'manuel'::text NOT NULL,
  not_metni text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  izin_talep_id uuid
);

CREATE TABLE personel_ucret (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  maas numeric(10,2) NOT NULL,
  gecerlilik_tarihi date DEFAULT CURRENT_DATE NOT NULL,
  ekleyen_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_arac (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  marka text NOT NULL,
  model text NOT NULL,
  plaka text NOT NULL,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE kamusal_odeme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  odeme_tipi text NOT NULL,
  tutar numeric(12,2) NOT NULL,
  donem_ay smallint NOT NULL,
  donem_yil smallint NOT NULL,
  vade_tarihi date NOT NULL,
  odeme_tarihi date,
  notlar text,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  arac_id uuid,
  odeme_yontemi text,
  banka_hesap_id uuid
);

CREATE TABLE seans_degerlendirme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  randevu_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  puan smallint,
  oneri_metni text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  goruldu_tarihi timestamp with time zone
);

CREATE TABLE randevu_talebi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  hasta_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  tercih_tarih date NOT NULL,
  tercih_saat time without time zone,
  terapist_id uuid,
  not_metni text,
  durum text DEFAULT 'bekliyor'::text NOT NULL,
  olusturulan_randevu_id uuid,
  yanit_kullanici_id uuid,
  yanit_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE destek_talebi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kullanici_id uuid NOT NULL,
  tur text NOT NULL,
  konu text NOT NULL,
  aciklama text NOT NULL,
  durum text DEFAULT 'yeni'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  guncellenme_tarihi timestamp with time zone
);

CREATE TABLE mesaj_kurallari (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tetikleyici_kodu text NOT NULL,
  aktif boolean DEFAULT true NOT NULL,
  sms_aktif boolean DEFAULT false NOT NULL,
  whatsapp_aktif boolean DEFAULT false NOT NULL,
  mail_aktif boolean DEFAULT false NOT NULL,
  mesaj_metni text DEFAULT ''::text NOT NULL,
  whatsapp_sablon_kodu text,
  zamanlama_offset_dakika integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE mesaj_kuyrugu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tetikleyici_kodu text NOT NULL,
  kanal mesaj_kanal_tipi NOT NULL,
  alici_tipi mesaj_alici_tipi NOT NULL,
  alici_id uuid NOT NULL,
  alici_adres text NOT NULL,
  gonderilecek_metin text NOT NULL,
  durum mesaj_kuyruk_durum_tipi DEFAULT 'beklemede'::mesaj_kuyruk_durum_tipi NOT NULL,
  planlanan_zaman timestamp with time zone DEFAULT now() NOT NULL,
  gonderim_zamani timestamp with time zone,
  deneme_sayisi integer DEFAULT 0 NOT NULL,
  saglayici_mesaj_id text,
  hata_mesaji text,
  idempotency_anahtari text NOT NULL,
  test_mi boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  isleme_alinma_zamani timestamp with time zone
);

CREATE TABLE mesaj_kredileri (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kanal mesaj_kanal_tipi NOT NULL,
  bakiye integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  son_senkron_zamani timestamp with time zone,
  merkez_bakiye_versiyonu bigint DEFAULT 0 NOT NULL
);

CREATE TABLE mesaj_kredi_hareketleri (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kanal mesaj_kanal_tipi NOT NULL,
  tip mesaj_kredi_hareket_tipi NOT NULL,
  miktar integer NOT NULL,
  tutar numeric(12,2),
  aciklama text,
  kuyruk_id uuid,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_anamnez (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  basvuru_sikayeti text NOT NULL,
  sikayet_baslangici text,
  agri_oykusu text,
  ilk_degerlendirme_notu text,
  durum text DEFAULT 'aktif'::text NOT NULL,
  olusturan_tip text,
  olusturan_kullanici_id uuid,
  son_guncelleyen_tip text,
  son_guncelleyen_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE resmi_tatil (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  tarih date NOT NULL,
  ad text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_izin_talebi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  tip text NOT NULL,
  baslangic_tarih date NOT NULL,
  bitis_tarih date NOT NULL,
  gun_sayisi numeric NOT NULL,
  gerekce text,
  belge_url text,
  durum text DEFAULT 'beklemede'::text NOT NULL,
  red_gerekce text,
  degerlendiren_kullanici_id uuid,
  degerlendirme_tarihi timestamp with time zone,
  iptal_eden_kullanici_id uuid,
  iptal_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_hesap_hareket (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  personel_id uuid NOT NULL,
  tur text NOT NULL,
  tutar numeric NOT NULL,
  tarih date DEFAULT CURRENT_DATE NOT NULL,
  aciklama text,
  kaynak_id uuid,
  ekleyen_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  odeme_tipi text,
  banka_hesap_id uuid
);

CREATE TABLE pozisyon_sablonlari (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ad text NOT NULL,
  grup text NOT NULL,
  sira integer DEFAULT 0 NOT NULL,
  sistem_erisimi boolean DEFAULT false NOT NULL,
  varsayilan_rol kullanici_rol_tipi DEFAULT 'terapist'::kullanici_rol_tipi NOT NULL,
  ucret_tipi text DEFAULT 'aylik_maas'::text NOT NULL,
  puantaj_modu text DEFAULT 'gunluk'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE pozisyonlar (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  sablon_id uuid,
  ad text NOT NULL,
  grup text NOT NULL,
  sira integer DEFAULT 0 NOT NULL,
  aktif boolean DEFAULT false NOT NULL,
  sistem_erisimi boolean DEFAULT false NOT NULL,
  varsayilan_rol kullanici_rol_tipi DEFAULT 'terapist'::kullanici_rol_tipi NOT NULL,
  ucret_tipi text DEFAULT 'aylik_maas'::text NOT NULL,
  puantaj_modu text DEFAULT 'gunluk'::text NOT NULL,
  ozel_mi boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_banka_hesaplari (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  banka_adi text NOT NULL,
  sube text,
  hesap_sahibi text NOT NULL,
  iban text NOT NULL,
  hesap_tipi text DEFAULT 'klinik'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE nakit_banka_hareketi (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tip text NOT NULL,
  kaynak_kasa boolean DEFAULT false NOT NULL,
  kaynak_banka_hesap_id uuid,
  hedef_kasa boolean DEFAULT false NOT NULL,
  hedef_banka_hesap_id uuid,
  odeme_yontemi text,
  karsi_taraf_adi text,
  karsi_taraf_banka text,
  karsi_taraf_iban text,
  aciklama text,
  tutar numeric NOT NULL,
  tarih date DEFAULT CURRENT_DATE NOT NULL,
  ekleyen_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE personel_egitim (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  personel_id uuid NOT NULL,
  derece text,
  okul text,
  bolum text,
  yil text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE hasta_yorum (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  hasta_id uuid NOT NULL,
  randevu_id uuid NOT NULL,
  tur text NOT NULL,
  yorum text NOT NULL,
  olusturan_kullanici_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  puan smallint
);

CREATE TABLE islem_tanimi_adim (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  islem_tanimi_id uuid NOT NULL,
  ad text NOT NULL,
  gerekli_cihaz_id uuid,
  sure_dakika integer,
  sira integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  uygulayici_pozisyon_id uuid
);

CREATE TABLE islem_adimi_sablonu (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  ad text NOT NULL,
  uygulayici_pozisyon_id uuid,
  sure_dakika integer,
  aktif boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  gerekli_cihaz_id uuid
);

CREATE TABLE hiz_siniri_sayac (
  anahtar text NOT NULL,
  pencere_baslangic timestamp with time zone NOT NULL,
  sayac integer DEFAULT 0 NOT NULL
);

CREATE TABLE audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid,
  kullanici_id uuid,
  eylem text NOT NULL,
  hedef_tablo text,
  hedef_id uuid,
  detay jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE randevu_cihaz_rezervasyon (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  randevu_id uuid NOT NULL,
  cihaz_id uuid NOT NULL,
  adim_id uuid,
  tur text NOT NULL,
  baslangic timestamp with time zone NOT NULL,
  bitis timestamp with time zone NOT NULL,
  zaman_araligi tstzrange GENERATED ALWAYS AS (tstzrange(baslangic, bitis, '[)'::text)) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE kasa_dengeleme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tutar numeric NOT NULL,
  aciklama text,
  ekleyen_kullanici_id uuid,
  ekleyen_ad text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_kredi_kartlari (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kart_tipi text DEFAULT 'klinik'::text NOT NULL,
  kart_adi text NOT NULL,
  banka_adi text NOT NULL,
  kart_sahibi text DEFAULT ''::text NOT NULL,
  son_dort_hane text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_cari_odeme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  tedarikci_adi text NOT NULL,
  tutar numeric(12,2) NOT NULL,
  tarih date NOT NULL,
  odeme_tipi text NOT NULL,
  banka_hesap_id uuid,
  kredi_karti_id uuid,
  aciklama text,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE klinik_kredi_karti_odeme (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  kredi_karti_id uuid NOT NULL,
  tutar numeric(12,2) NOT NULL,
  tarih date NOT NULL,
  odeme_tipi text NOT NULL,
  banka_hesap_id uuid,
  aciklama text,
  olusturan_kullanici_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE resmi_tatil_oneri (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  klinik_id uuid NOT NULL,
  yil integer NOT NULL,
  bayram text NOT NULL,
  tarih date NOT NULL,
  ad text NOT NULL,
  kaynak text DEFAULT 'nager'::text NOT NULL,
  durum text DEFAULT 'bekliyor'::text NOT NULL,
  karar_veren_id uuid,
  karar_tarihi timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE audit_log_varsayilan PARTITION OF audit_log DEFAULT;

-- ===== Fonksiyonlar =====
CREATE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.portal_giris_epostasi(p_telefon text)
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
$function$
;

CREATE FUNCTION public.randevu_iptal_talebi_klinik_id_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM randevu WHERE id = NEW.randevu_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.hasta_hassas_klinik_id_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM hasta WHERE id = NEW.hasta_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.derive_klinik_id_from_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_parent_id_col text := TG_ARGV[1];
  v_parent_id uuid;
BEGIN
  v_parent_id := (to_jsonb(NEW) ->> v_parent_id_col)::uuid;
  EXECUTE format('SELECT klinik_id FROM %I WHERE id = $1', v_parent_table)
    INTO NEW.klinik_id
    USING v_parent_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.audit_log_yaz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_hedef_id uuid;
BEGIN
  v_klinik_id := COALESCE(NEW.klinik_id, OLD.klinik_id);
  v_hedef_id := COALESCE(NEW.id, OLD.id);

  -- Klinik silinirken (CASCADE) klinik satırı artık yok: FK'yi ihlal edecek denetim satırı yazma.
  IF v_klinik_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM klinik WHERE id = v_klinik_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (
    v_klinik_id,
    app_kullanici_id(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_hedef_id,
    to_jsonb(COALESCE(NEW, OLD))
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE FUNCTION public.hasta_terapist_sadece_risk_guncelle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_rol() = 'terapist' THEN
    IF (to_jsonb(NEW) - 'risk_bayraklari' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'risk_bayraklari' - 'updated_at') THEN
      RAISE EXCEPTION 'terapist_sadece_risk_bayraklari_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.randevu_on_form_dogrula()
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
$function$
;

CREATE FUNCTION public.hasta_iliski_klinik_dogrula()
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
$function$
;

CREATE FUNCTION public.hasta_belge_onam_dogrula()
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
$function$
;

CREATE FUNCTION public.hasta_belge_goruntule(p_id uuid)
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
    v_row.klinik_id, app_kullanici_id(), 'select', 'hasta_belge', v_row.id,
    jsonb_build_object('portal_hasta_mi', v_row.hasta_id = current_hasta_id())
  );

  RETURN v_row;
END;
$function$
;

CREATE FUNCTION public.hasta_protokol_kontrendikasyon_kontrol()
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
$function$
;

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
  v_fiyat numeric;
  v_kalem_toplam numeric := 0;
  v_satir_toplam numeric := 0;
  v_net_toplam numeric;
  v_katilimci_sayisi integer;
  v_var_islem boolean := false;
  v_paket_adlari text[] := '{}';
  v_borc_id uuid;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() NOT IN ('klinik_admin', 'resepsiyon') AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'hasta_bulunamadi';
  END IF;

  -- İçinde işlem kalemi var mı önceden belirleniyor — varsa eski peşin
  -- ödeme yoluna, yoksa (sadece paket) yeni borç yoluna gidiliyor.
  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    IF v_kalem->>'tur' = 'islem' THEN
      v_var_islem := true;
    END IF;
  END LOOP;

  IF v_var_islem THEN
    INSERT INTO odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
    VALUES (v_klinik_id, p_hasta_id, app_kullanici_id(), p_iskonto_tutari, p_faturali, p_aciklama)
    RETURNING id INTO v_odeme_id;
  END IF;

  FOR v_kalem IN SELECT * FROM jsonb_array_elements(p_kalemler)
  LOOP
    v_miktar := GREATEST(COALESCE((v_kalem->>'miktar')::integer, 1), 1);

    IF v_kalem->>'tur' = 'islem' THEN
      SELECT * INTO v_islem FROM islem_tanimi
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, p_hasta_id);

      INSERT INTO odeme_kalemi (odeme_id, islem_tanimi_id, miktar, birim_fiyat, kdv_orani)
      VALUES (v_odeme_id, v_islem.id, v_miktar, v_fiyat, v_islem.kdv_orani);

      v_kalem_toplam := v_kalem_toplam + v_fiyat * v_miktar;

    ELSIF v_kalem->>'tur' = 'paket' THEN
      -- FOR UPDATE: aynı pakete eşzamanlı satış yapan başka bir transaction
      -- varsa burada bekletiliyor — kota sayımı ve satır ekleme artık aynı
      -- paket için serileşiyor (kota_doldu TOCTOU'sunun düzeltmesi).
      SELECT * INTO v_paket FROM paket
        WHERE id = (v_kalem->>'ref_id')::uuid AND klinik_id = v_klinik_id AND aktif
          AND (satis_bitis_tarihi IS NULL OR satis_bitis_tarihi >= current_date)
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'urun_bulunamadi';
      END IF;

      IF v_paket.kisi_kotasi IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM paket_satis WHERE paket_id = v_paket.id AND hasta_id = p_hasta_id)
      THEN
        SELECT count(DISTINCT hasta_id) INTO v_katilimci_sayisi
          FROM paket_satis WHERE paket_id = v_paket.id AND durum = 'aktif';
        IF v_katilimci_sayisi >= v_paket.kisi_kotasi THEN
          RAISE EXCEPTION 'kota_doldu';
        END IF;
      END IF;

      -- v_var_islem=false iken v_odeme_id hiç atanmamış (NULL) olarak
      -- kalıyor — paket_satis.odeme_id nullable, bilinçli olarak boş bırakılıyor.
      INSERT INTO paket_satis (klinik_id, hasta_id, paket_id, odeme_id, kalan_adet)
      VALUES (v_klinik_id, p_hasta_id, v_paket.id, v_odeme_id, v_paket.seans_sayisi)
      RETURNING id INTO v_paket_satis_id;

      v_paket_adlari := array_append(v_paket_adlari, v_paket.ad);

      IF v_var_islem THEN
        INSERT INTO odeme_kalemi (odeme_id, paket_satis_id, miktar, birim_fiyat, kdv_orani)
        VALUES (v_odeme_id, v_paket_satis_id, 1, v_paket.fiyat, v_paket.kdv_orani);
      END IF;

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

  IF v_var_islem THEN
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
  END IF;

  -- Sadece paket satışı: p_satirlar tamamen YOK SAYILIYOR (ödeme girilmiyor)
  -- — bunun yerine borç satırı ekleniyor, iskonto satırın kendi
  -- iskonto_tutari kolonunda, "Borç Satırını Düzenle" ile sonradan (iskonto/
  -- fatura) yeniden düzenlenebilir.
  INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, iskonto_tutari, aciklama)
  VALUES (
    v_klinik_id, p_hasta_id, 'borc', v_kalem_toplam, p_iskonto_tutari,
    COALESCE(NULLIF(p_aciklama, ''), array_to_string(v_paket_adlari, ', '))
  )
  RETURNING id INTO v_borc_id;

  RETURN v_borc_id;
END;
$function$
;

CREATE FUNCTION public.personel_hassas_kaydet(p_personel_id uuid, p_tc_kimlik text, p_pasaport text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_personel personel%rowtype;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found then
    raise exception 'personel_bulunamadi';
  end if;

  if not coalesce(
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id()),
    false
  ) then
    raise exception 'yetkisiz';
  end if;

  insert into personel_hassas (personel_id, tc_kimlik, pasaport_no)
  values (
    p_personel_id,
    case when p_tc_kimlik is null or p_tc_kimlik = '' then null else p_tc_kimlik end,
    case when p_pasaport is null or p_pasaport = '' then null else p_pasaport end
  )
  on conflict (personel_id) do update set
    tc_kimlik = excluded.tc_kimlik,
    pasaport_no = excluded.pasaport_no,
    updated_at = now();

  insert into audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  values (v_personel.klinik_id, app_kullanici_id(), 'update', 'personel_hassas', p_personel_id, '{}'::jsonb);
end;
$function$
;

CREATE FUNCTION public.personel_hassas_maskeli_getir(p_personel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_personel personel%rowtype;
  v_row personel_hassas%rowtype;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found then
    raise exception 'personel_bulunamadi';
  end if;

  if not coalesce(
    is_super_admin()
    or (current_rol() = 'klinik_admin' and v_personel.klinik_id = current_klinik_id())
    or v_personel.kullanici_id = app_kullanici_id(),
    false
  ) then
    raise exception 'yetkisiz';
  end if;

  select * into v_row from personel_hassas where personel_id = p_personel_id;
  if not found then
    return jsonb_build_object('tc_kimlik_var', false, 'tc_kimlik_son2', null, 'pasaport_var', false, 'pasaport_son2', null);
  end if;

  return jsonb_build_object(
    'tc_kimlik_var', v_row.tc_kimlik is not null,
    'tc_kimlik_son2', case when v_row.tc_kimlik is not null then right(v_row.tc_kimlik, 2) else null end,
    'pasaport_var', v_row.pasaport_no is not null,
    'pasaport_son2', case when v_row.pasaport_no is not null then right(v_row.pasaport_no, 2) else null end
  );
end;
$function$
;

CREATE FUNCTION public.hasta_hassas_terapist_sadece_anamnez_guncelle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anamnez_kolonlari text[] := ARRAY[
    'alerji_var','alerjiler','kan_sulandirici_kullanimi','kan_sulandirici_detay',
    'kronik_hastalik_var','kronik_hastaliklar','surekli_ilac_var','surekli_ilaclar',
    'ameliyat_var','gecirilmis_ameliyatlar','bulasici_hastalik_var','bulasici_hastalik_detay',
    'protez_implant_var','protez_implant_detay','hamilelik_emzirme_var','hamilelik_emzirme_detay',
    'sigara_alkol_madde_var','sigara_alkol_madde_detay','gelis_sebebi','oncelik_durumu','updated_at',
    'son_guncelleyen_tip','son_guncelleyen_kullanici_id'
  ];
BEGIN
  IF current_rol() = 'terapist' THEN
    IF (to_jsonb(NEW) - v_anamnez_kolonlari) IS DISTINCT FROM (to_jsonb(OLD) - v_anamnez_kolonlari) THEN
      RAISE EXCEPTION 'terapist_sadece_anamnez_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.hasta_hassas_terapist_sadece_anamnez_ekle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_rol() = 'terapist' THEN
    IF NEW.kimlik_no IS NOT NULL OR NEW.kimlik_no_tipi IS NOT NULL OR NEW.il IS NOT NULL
       OR NEW.ilce IS NOT NULL OR NEW.mahalle IS NOT NULL OR NEW.adres IS NOT NULL
       OR NEW.acil_durum_ad_soyad IS NOT NULL OR NEW.acil_durum_yakinlik IS NOT NULL
       OR NEW.acil_durum_telefon IS NOT NULL OR NEW.anne_adi IS NOT NULL OR NEW.anne_telefon IS NOT NULL
       OR NEW.baba_adi IS NOT NULL OR NEW.baba_telefon IS NOT NULL
       OR NEW.diger_yakini_ad_soyad IS NOT NULL OR NEW.diger_yakini_telefon IS NOT NULL
       OR NEW.diger_yakini_yakinlik IS NOT NULL THEN
      RAISE EXCEPTION 'terapist_sadece_anamnez_guncelleyebilir';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.hasta_hassas_denetim_bilgisi_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_rol() IS NOT NULL THEN
    NEW.son_guncelleyen_tip := 'personel';
    NEW.son_guncelleyen_kullanici_id := app_kullanici_id();
  ELSIF current_hasta_id() IS NOT NULL THEN
    NEW.son_guncelleyen_tip := 'hasta';
    NEW.son_guncelleyen_kullanici_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.olusturan_tip := NEW.son_guncelleyen_tip;
    NEW.olusturan_kullanici_id := NEW.son_guncelleyen_kullanici_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.randevu_gelis_isaretle(p_randevu_id uuid, p_gecikme_dakika integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_yeni_durum randevu_durum_tipi;
  v_paket_satis paket_satis%ROWTYPE;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = app_kullanici_id()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum IN ('iptal', 'tamamlandi') THEN
    RAISE EXCEPTION 'randevu_kapali';
  END IF;

  v_yeni_durum := CASE WHEN p_gecikme_dakika IS NOT NULL THEN 'gecikmeli_geldi' ELSE 'geldi' END;
  UPDATE randevu SET durum = v_yeni_durum, gecikme_dakika = p_gecikme_dakika WHERE id = p_randevu_id;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

  IF v_randevu.paket_satis_id IS NOT NULL THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  SELECT ps.* INTO v_paket_satis
  FROM paket_satis ps
  JOIN paket p ON p.id = ps.paket_id
  WHERE ps.hasta_id = v_randevu.hasta_id
    AND ps.klinik_id = v_randevu.klinik_id
    AND p.islem_tanimi_id = v_randevu.islem_tanimi_id
    AND ps.durum = 'aktif'
    AND ps.kalan_adet > 0
  ORDER BY ps.satis_tarihi ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet - 1,
        durum = CASE WHEN kalan_adet - 1 <= 0 THEN 'bitti' ELSE durum END,
        updated_at = now()
    WHERE id = v_paket_satis.id;

    UPDATE randevu SET paket_satis_id = v_paket_satis.id WHERE id = p_randevu_id;

    RETURN jsonb_build_object(
      'yontem', 'paket', 'hasta_id', v_randevu.hasta_id,
      'paket_satis_id', v_paket_satis.id, 'kalan_adet', v_paket_satis.kalan_adet - 1
    );
  END IF;

  -- Paketsiz: bakiye seans tamamlanana kadar bekler (bkz. randevu_seans_bedelini_isle).
  RETURN jsonb_build_object('yontem', 'bekliyor', 'hasta_id', v_randevu.hasta_id);
END;
$function$
;

CREATE FUNCTION public.hasta_arsiv_ice_aktar(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_hasta_id uuid;
  v_kimlik_no text;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      IF NULLIF(v_kayit->>'ad_soyad', '') IS NULL OR NULLIF(v_kayit->>'telefon', '') IS NULL THEN
        RAISE EXCEPTION 'ad_soyad_veya_telefon_eksik';
      END IF;

      INSERT INTO hasta (
        klinik_id, ad_soyad, telefon, dogum_tarihi, cinsiyet, eposta, referans_kanali,
        whatsapp_izin_durumu
      ) VALUES (
        v_klinik_id,
        v_kayit->>'ad_soyad',
        v_kayit->>'telefon',
        NULLIF(v_kayit->>'dogum_tarihi', '')::date,
        NULLIF(v_kayit->>'cinsiyet', ''),
        NULLIF(v_kayit->>'eposta', ''),
        NULLIF(v_kayit->>'referans_kanali', ''),
        COALESCE((v_kayit->>'whatsapp_izin_durumu')::boolean, false)
      )
      RETURNING id INTO v_hasta_id;

      v_kimlik_no := NULLIF(v_kayit->>'kimlik_no', '');

      IF v_kimlik_no IS NOT NULL
        OR NULLIF(v_kayit->>'adres', '') IS NOT NULL
        OR NULLIF(v_kayit->>'acil_durum_ad_soyad', '') IS NOT NULL
        OR NULLIF(v_kayit->>'kronik_hastaliklar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'surekli_ilaclar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'alerjiler', '') IS NOT NULL
        OR NULLIF(v_kayit->>'gecirilmis_ameliyatlar', '') IS NOT NULL
        OR NULLIF(v_kayit->>'gelis_sebebi', '') IS NOT NULL
      THEN
        INSERT INTO hasta_hassas (
          hasta_id, klinik_id, kimlik_no, kimlik_no_tipi, adres, il, ilce, mahalle,
          acil_durum_ad_soyad, acil_durum_yakinlik, acil_durum_telefon,
          kronik_hastaliklar, surekli_ilaclar, alerjiler, gecirilmis_ameliyatlar, gelis_sebebi
        ) VALUES (
          v_hasta_id, v_klinik_id, v_kimlik_no,
          CASE WHEN v_kimlik_no IS NULL THEN NULL
               ELSE COALESCE(NULLIF(v_kayit->>'kimlik_no_tipi', ''), 'tc') END,
          NULLIF(v_kayit->>'adres', ''),
          NULLIF(v_kayit->>'il', ''),
          NULLIF(v_kayit->>'ilce', ''),
          NULLIF(v_kayit->>'mahalle', ''),
          NULLIF(v_kayit->>'acil_durum_ad_soyad', ''),
          NULLIF(v_kayit->>'acil_durum_yakinlik', ''),
          NULLIF(v_kayit->>'acil_durum_telefon', ''),
          NULLIF(v_kayit->>'kronik_hastaliklar', ''),
          NULLIF(v_kayit->>'surekli_ilaclar', ''),
          NULLIF(v_kayit->>'alerjiler', ''),
          NULLIF(v_kayit->>'gecirilmis_ameliyatlar', ''),
          NULLIF(v_kayit->>'gelis_sebebi', '')
        );
      END IF;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'hasta_id', v_hasta_id
      );
    EXCEPTION
      WHEN unique_violation THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'atlandi', 'sebep', 'Bu kimlik numarasına sahip bir hasta zaten kayıtlı.'
        );
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$
;

CREATE FUNCTION public.randevu_arsiv_ice_aktar(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_randevu_id uuid;
  v_hasta_id uuid;
  v_terapist_id uuid;
  v_oda_id uuid;
  v_cihaz_id uuid;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_terapist_id := NULLIF(v_kayit->>'terapist_id', '')::uuid;
      v_oda_id := NULLIF(v_kayit->>'oda_id', '')::uuid;
      v_cihaz_id := NULLIF(v_kayit->>'cihaz_id', '')::uuid;

      IF v_hasta_id IS NULL OR v_terapist_id IS NULL OR v_oda_id IS NULL THEN
        RAISE EXCEPTION 'hasta_terapist_oda_eksik';
      END IF;
      IF NULLIF(v_kayit->>'baslangic', '') IS NULL OR NULLIF(v_kayit->>'bitis', '') IS NULL THEN
        RAISE EXCEPTION 'baslangic_bitis_eksik';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM terapist WHERE id = v_terapist_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'terapist_bulunamadi';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM oda WHERE id = v_oda_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'oda_bulunamadi';
      END IF;
      IF v_cihaz_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cihaz WHERE id = v_cihaz_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'cihaz_bulunamadi';
      END IF;

      INSERT INTO randevu (
        klinik_id, hasta_id, terapist_id, oda_id, cihaz_id, islem_tanimi_id,
        baslangic, bitis, durum, tani, kaynak, olusturan_kullanici_id
      ) VALUES (
        v_klinik_id, v_hasta_id, v_terapist_id, v_oda_id, v_cihaz_id,
        NULLIF(v_kayit->>'islem_tanimi_id', '')::uuid,
        (v_kayit->>'baslangic')::timestamptz,
        (v_kayit->>'bitis')::timestamptz,
        'tamamlandi', NULLIF(v_kayit->>'tani', ''), 'arsiv', app_kullanici_id()
      )
      RETURNING id INTO v_randevu_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'randevu_id', v_randevu_id
      );
    EXCEPTION
      WHEN exclusion_violation THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'atlandi',
          'sebep', 'Bu terapist/oda için aynı zaman aralığında başka bir randevu var (çakışma).'
        );
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$
;

CREATE FUNCTION public.hasta_bakiye_hareket_arsiv_ekle(p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_hareket_id uuid;
  v_hasta_id uuid;
  v_tur text;
  v_tarih timestamptz;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_tur := NULLIF(v_kayit->>'tur', '');

      IF v_hasta_id IS NULL OR v_tur NOT IN ('odeme', 'kredi', 'borc') THEN
        RAISE EXCEPTION 'hasta_veya_tur_gecersiz';
      END IF;
      IF NULLIF(v_kayit->>'tutar', '') IS NULL OR (v_kayit->>'tutar')::numeric <= 0 THEN
        RAISE EXCEPTION 'tutar_gecersiz';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;

      v_tarih := COALESCE(NULLIF(v_kayit->>'tarih', '')::timestamptz, now());

      INSERT INTO hasta_bakiye_hareket (klinik_id, hasta_id, tur, tutar, aciklama, kaynak, created_at)
      VALUES (
        v_klinik_id, v_hasta_id, v_tur, (v_kayit->>'tutar')::numeric,
        COALESCE(NULLIF(v_kayit->>'aciklama', ''), 'Arşivden aktarıldı'), 'arsiv', v_tarih
      )
      RETURNING id INTO v_hareket_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'hareket_id', v_hareket_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$
;

CREATE FUNCTION public.paket_satis_arsiv_ekle(p_paket_id uuid, p_kayitlar jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_kayit jsonb;
  v_satir_no integer;
  v_paket_satis_id uuid;
  v_hasta_id uuid;
  v_kalan_adet integer;
  v_sonuclar jsonb := '[]'::jsonb;
BEGIN
  v_klinik_id := current_klinik_id();
  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM paket WHERE id = p_paket_id AND klinik_id = v_klinik_id) THEN
    RAISE EXCEPTION 'paket_bulunamadi';
  END IF;

  FOR v_kayit, v_satir_no IN
    SELECT value, ordinality FROM jsonb_array_elements(p_kayitlar) WITH ORDINALITY
  LOOP
    BEGIN
      v_hasta_id := NULLIF(v_kayit->>'hasta_id', '')::uuid;
      v_kalan_adet := NULLIF(v_kayit->>'kalan_adet', '')::integer;

      IF v_hasta_id IS NULL OR v_kalan_adet IS NULL OR v_kalan_adet < 0 THEN
        RAISE EXCEPTION 'hasta_veya_kalan_adet_gecersiz';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM hasta WHERE id = v_hasta_id AND klinik_id = v_klinik_id) THEN
        RAISE EXCEPTION 'hasta_bulunamadi';
      END IF;

      INSERT INTO paket_satis (
        klinik_id, hasta_id, paket_id, kalan_adet, satis_tarihi, gecerlilik_bitis_tarihi, durum
      ) VALUES (
        v_klinik_id, v_hasta_id, p_paket_id, v_kalan_adet,
        COALESCE(NULLIF(v_kayit->>'satis_tarihi', '')::date, current_date),
        NULLIF(v_kayit->>'gecerlilik_bitis_tarihi', '')::date,
        CASE WHEN v_kalan_adet <= 0 THEN 'bitti' ELSE 'aktif' END
      )
      RETURNING id INTO v_paket_satis_id;

      v_sonuclar := v_sonuclar || jsonb_build_object(
        'satir_no', v_satir_no, 'durum', 'eklendi', 'paket_satis_id', v_paket_satis_id
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_sonuclar := v_sonuclar || jsonb_build_object(
          'satir_no', v_satir_no, 'durum', 'hata', 'sebep', SQLERRM
        );
    END;
  END LOOP;

  RETURN v_sonuclar;
END;
$function$
;

CREATE FUNCTION public.hasta_qr_self_servis_mi(p_hasta_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM hasta WHERE id = p_hasta_id AND kayit_kanali = 'qr_self_servis');
$function$
;

CREATE FUNCTION public.islem_tanimi_fiyat_gecmisi_yaz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE islem_tanimi_fiyat_gecmisi
      SET gecerlilik_bitis = now()
      WHERE islem_tanimi_id = NEW.id AND gecerlilik_bitis IS NULL;
  END IF;

  INSERT INTO islem_tanimi_fiyat_gecmisi
    (islem_tanimi_id, klinik_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, degistiren_kullanici_id)
  VALUES
    (NEW.id, NEW.klinik_id, NEW.vita_fiyat, NEW.plus_fiyat, NEW.elit_fiyat, NEW.prime_fiyat, NEW.kdv_orani, app_kullanici_id());

  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.islem_tanimi_etkin_fiyat(p_islem_tanimi_id uuid, p_hasta_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_islem islem_tanimi%ROWTYPE;
  v_kategori text;
  v_oranlar iskonto_oranlari%ROWTYPE;
  v_override numeric;
  v_pct numeric;
BEGIN
  SELECT * INTO v_islem FROM islem_tanimi WHERE id = p_islem_tanimi_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT kategori INTO v_kategori FROM hasta WHERE id = p_hasta_id;
  v_kategori := COALESCE(v_kategori, 'vita');

  IF v_kategori = 'vita' THEN
    RETURN v_islem.vita_fiyat;
  END IF;

  v_override := CASE v_kategori
    WHEN 'plus' THEN v_islem.plus_fiyat
    WHEN 'elit' THEN v_islem.elit_fiyat
    WHEN 'prime' THEN v_islem.prime_fiyat
    ELSE NULL
  END;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  SELECT * INTO v_oranlar FROM iskonto_oranlari WHERE klinik_id = v_islem.klinik_id;
  v_pct := COALESCE(
    CASE v_kategori
      WHEN 'plus' THEN v_oranlar.plus_pct
      WHEN 'elit' THEN v_oranlar.elit_pct
      WHEN 'prime' THEN v_oranlar.prime_pct
      ELSE NULL
    END, 0
  );

  RETURN round(v_islem.vita_fiyat * (1 - v_pct / 100), 2);
END;
$function$
;

CREATE FUNCTION public.resepsiyon_puantaj_gorebilir_mi()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (ayarlar ->> 'resepsiyon_puantaj_gorebilir')::boolean FROM klinik_ayarlar WHERE klinik_id = current_klinik_id()),
    false
  );
$function$
;

CREATE FUNCTION public.personel_puantaj_planlanan_getir(p_personel_id uuid, p_tarih date)
 RETURNS TABLE(vardiya_turu_id uuid, baslangic time without time zone, bitis time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pva.vardiya_turu_id, vt.baslangic_saat, vt.bitis_saat
  FROM personel_vardiya_atama pva
  JOIN vardiya_turu vt ON vt.id = pva.vardiya_turu_id
  WHERE pva.personel_id = p_personel_id
    AND (pva.klinik_id = current_klinik_id() OR is_super_admin())
    AND pva.haftanin_gunu = EXTRACT(DOW FROM p_tarih)::smallint
    AND pva.gecerlilik_baslangic <= p_tarih
    AND (pva.gecerlilik_bitis IS NULL OR pva.gecerlilik_bitis >= p_tarih)
  ORDER BY pva.gecerlilik_baslangic DESC
  LIMIT 1;
$function$
;

CREATE FUNCTION public.personel_puantaj_varsayilanlari_doldur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan record;
  v_mola_varsayilan integer;
  v_izinli boolean;
begin
  if new.planlanan_baslangic is null and new.planlanan_bitis is null then
    select * into v_plan from personel_puantaj_planlanan_getir(new.personel_id, new.tarih);
    if found then
      new.planlanan_baslangic := v_plan.baslangic;
      new.planlanan_bitis := v_plan.bitis;
    end if;
  end if;

  if new.mola_dakika is null then
    select (ayarlar ->> 'varsayilan_mola_dk')::int into v_mola_varsayilan
    from klinik_ayarlar where klinik_id = new.klinik_id;
    new.mola_dakika := coalesce(v_mola_varsayilan, 0);
  end if;

  if new.durum is null then
    select true into v_izinli
    from personel_izin_talebi pit
    where pit.personel_id = new.personel_id
      and pit.durum = 'onaylandi'
      and pit.baslangic_tarih <= new.tarih
      and pit.bitis_tarih >= new.tarih
    limit 1;

    new.durum := case when v_izinli then 'izinli' else 'calisti' end;
  end if;

  return new;
end;
$function$
;

CREATE FUNCTION public.personel_puantaj_fm_onay_denetim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.fm_onay_durumu IS DISTINCT FROM OLD.fm_onay_durumu THEN
    IF NEW.fm_onay_durumu IN ('onaylandi', 'reddedildi') THEN
      NEW.fm_onaylayan_id := app_kullanici_id();
      NEW.fm_onay_tarihi := now();
    ELSE
      NEW.fm_onaylayan_id := NULL;
      NEW.fm_onay_tarihi := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.personel_puantaj_donemi_acik_mi(p_personel_id uuid, p_tarih date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM personel_puantaj_donem d
    WHERE d.personel_id = p_personel_id
      AND (d.klinik_id = current_klinik_id() OR is_super_admin())
      AND d.yil = EXTRACT(YEAR FROM p_tarih)::int
      AND d.ay = EXTRACT(MONTH FROM p_tarih)::int
      AND d.durum = 'kapali'
  );
$function$
;

CREATE FUNCTION public.personel_puantaj_donem_kapat(p_personel_id uuid, p_yil integer, p_ay integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean :=sistem_baglami();
  v_klinik_id uuid;
  v_personel personel%ROWTYPE;
  v_ay_baslangic date;
  v_ay_bitis date;
  v_puantaj_ust_sinir date;
  v_net_dk numeric;
  v_fm_dk numeric;
  v_eksik_dk numeric;
  v_izin_gun integer;
  v_devamsizlik_gun integer;
  v_donem_id uuid;
  v_fm_saat numeric;
  v_hakedis_tutar numeric;
BEGIN
  IF NOT (v_is_service OR COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false)) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  SELECT * INTO v_personel FROM personel
  WHERE id = p_personel_id AND (v_is_service OR klinik_id = current_klinik_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;
  v_klinik_id := v_personel.klinik_id;

  IF EXISTS (
    SELECT 1 FROM personel_puantaj_donem
    WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay AND durum = 'kapali'
  ) THEN
    RAISE EXCEPTION 'donem_zaten_kapali';
  END IF;

  v_ay_baslangic := make_date(p_yil, p_ay, 1);
  v_ay_bitis := (v_ay_baslangic + interval '1 month')::date;

  v_puantaj_ust_sinir := v_ay_bitis;
  IF v_personel.isten_cikis_tarihi IS NOT NULL AND v_personel.isten_cikis_tarihi < v_ay_bitis THEN
    v_puantaj_ust_sinir := v_personel.isten_cikis_tarihi + 1;
  END IF;

  SELECT
    COALESCE(SUM(net_calisma_dakika), 0),
    COALESCE(SUM(fazla_mesai_dakika) FILTER (WHERE fm_onay_durumu = 'onaylandi'), 0),
    COALESCE(SUM(eksik_calisma_dakika), 0),
    COUNT(*) FILTER (WHERE durum IN ('izinli', 'raporlu')),
    COUNT(*) FILTER (WHERE durum = 'gelmedi')
  INTO v_net_dk, v_fm_dk, v_eksik_dk, v_izin_gun, v_devamsizlik_gun
  FROM personel_puantaj
  WHERE personel_id = p_personel_id AND tarih >= v_ay_baslangic AND tarih < v_puantaj_ust_sinir;

  INSERT INTO personel_puantaj_donem (
    klinik_id, personel_id, yil, ay, durum,
    snapshot_net_saat, snapshot_onayli_fm_saat, snapshot_eksik_saat,
    snapshot_izin_gun, snapshot_devamsizlik_gun, kapatan_id, kapatma_tarihi
  ) VALUES (
    v_klinik_id, p_personel_id, p_yil, p_ay, 'kapali',
    round(v_net_dk / 60.0, 2), round(v_fm_dk / 60.0, 2), round(v_eksik_dk / 60.0, 2),
    v_izin_gun, v_devamsizlik_gun, app_kullanici_id(), now()
  )
  ON CONFLICT (personel_id, yil, ay) DO UPDATE SET
    durum = 'kapali',
    snapshot_net_saat = EXCLUDED.snapshot_net_saat,
    snapshot_onayli_fm_saat = EXCLUDED.snapshot_onayli_fm_saat,
    snapshot_eksik_saat = EXCLUDED.snapshot_eksik_saat,
    snapshot_izin_gun = EXCLUDED.snapshot_izin_gun,
    snapshot_devamsizlik_gun = EXCLUDED.snapshot_devamsizlik_gun,
    kapatan_id = EXCLUDED.kapatan_id,
    kapatma_tarihi = EXCLUDED.kapatma_tarihi
  RETURNING id INTO v_donem_id;

  v_fm_saat := round(v_fm_dk / 60.0, 2);

  IF v_fm_saat > 0 AND NOT EXISTS (
    SELECT 1 FROM personel_hesap_hareket WHERE kaynak_id = v_donem_id AND tur = 'mesai'
  ) THEN
    v_hakedis_tutar := COALESCE(v_personel.fm_saatlik_ucret, 0) * v_fm_saat;

    INSERT INTO personel_hesap_hareket (
      klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id
    ) VALUES (
      v_klinik_id, p_personel_id, 'mesai', GREATEST(v_hakedis_tutar, 0.01), (v_ay_bitis - 1),
      format(
        '%s/%s dönemi onaylı fazla mesai: %s sa%s', p_ay, p_yil, v_fm_saat,
        CASE WHEN v_personel.fm_saatlik_ucret IS NULL
          THEN ' — saatlik ücret tanımlı değil, tutar elle güncellenmeli'
          ELSE '' END
      ),
      v_donem_id, app_kullanici_id()
    );
  END IF;

  RETURN jsonb_build_object(
    'donem_id', v_donem_id,
    'net_saat', round(v_net_dk / 60.0, 2),
    'onayli_fm_saat', v_fm_saat,
    'eksik_saat', round(v_eksik_dk / 60.0, 2),
    'izin_gun', v_izin_gun,
    'devamsizlik_gun', v_devamsizlik_gun
  );
END;
$function$
;

CREATE FUNCTION public.personel_puantaj_donem_yeniden_ac(p_personel_id uuid, p_yil integer, p_ay integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_donem_id uuid;
BEGIN
  IF NOT COALESCE(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  UPDATE personel_puantaj_donem
  SET durum = 'acik', kapatan_id = NULL, kapatma_tarihi = NULL
  WHERE personel_id = p_personel_id AND yil = p_yil AND ay = p_ay
    AND klinik_id = current_klinik_id()
    AND durum = 'kapali'
  RETURNING id INTO v_donem_id;

  IF v_donem_id IS NULL THEN
    RAISE EXCEPTION 'donem_bulunamadi_veya_zaten_acik';
  END IF;

  -- Dönem kapanışının yazdığı satırlar; tekrar kapatınca güncel hesapla yeniden yazılır.
  DELETE FROM personel_hesap_hareket
  WHERE kaynak_id = v_donem_id AND tur IN ('hakedis', 'prim', 'mesai');
END;
$function$
;

CREATE FUNCTION public.seans_degerlendirme_alanlari_doldur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = NEW.randevu_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;
  NEW.klinik_id := v_randevu.klinik_id;
  NEW.hasta_id := v_randevu.hasta_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.randevu_anket_uygun_mu(p_randevu_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM randevu
    WHERE id = p_randevu_id AND durum IN ('tamamlandi', 'geldi', 'gecikmeli_geldi')
  );
$function$
;

CREATE FUNCTION public.seans_degerlendirme_baglam_getir(p_randevu_id uuid)
 RETURNS TABLE(klinik_ad text, zaten_dolduruldu boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT k.ad, EXISTS (SELECT 1 FROM seans_degerlendirme sd WHERE sd.randevu_id = p_randevu_id)
  FROM randevu r
  JOIN klinik k ON k.id = r.klinik_id
  WHERE r.id = p_randevu_id;
$function$
;

CREATE FUNCTION public.qr_kodu_aktif_mi(p_klinik_id uuid, p_tip text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT (ayarlar -> 'qr_kodlari' -> p_tip ->> 'aktif')::boolean
      FROM klinik_ayarlar
      WHERE klinik_id = p_klinik_id
    ),
    true
  );
$function$
;

CREATE FUNCTION public.randevu_talebi_klinik_id_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT klinik_id INTO NEW.klinik_id FROM hasta WHERE id = NEW.hasta_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.hasta_bakiye_hareket_borc_duzenle(p_hareket_id uuid, p_iskonto_tutari numeric, p_faturali boolean, p_aciklama text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid;
  v_hareket hasta_bakiye_hareket%rowtype;
  v_randevu randevu%rowtype;
  v_islem islem_tanimi%rowtype;
  v_kalem_aciklama text;
  v_kdv_orani numeric := 0;
  v_net_toplam numeric;
  v_odeme_id uuid;
  v_hasta hasta%rowtype;
  v_kimlik_var boolean;
  v_adres_var boolean;
  v_eksikler text[] := '{}';
begin
  v_klinik_id := current_klinik_id();

  if v_klinik_id is null or (current_rol() not in ('klinik_admin', 'resepsiyon', 'muhasebe') and not is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select * into v_hareket from hasta_bakiye_hareket
    where id = p_hareket_id and klinik_id = v_klinik_id for update;
  if not found then
    raise exception 'hareket_bulunamadi';
  end if;

  if v_hareket.tur <> 'borc' then
    raise exception 'gecersiz_hareket_turu';
  end if;

  if p_iskonto_tutari is null or p_iskonto_tutari < 0 then
    raise exception 'iskonto_gecersiz';
  end if;

  if p_iskonto_tutari > v_hareket.tutar then
    raise exception 'iskonto_fazla';
  end if;

  v_net_toplam := v_hareket.tutar - p_iskonto_tutari;

  -- Kesilmiş (gönderilmiş) faturanın tutarı değiştirilemez; önce fatura iptal/iade edilmeli.
  if v_hareket.odeme_id is not null
     and p_iskonto_tutari is distinct from v_hareket.iskonto_tutari
     and exists (select 1 from fatura where odeme_id = v_hareket.odeme_id and durum = 'kesildi') then
    raise exception 'fatura_kesilmis';
  end if;

  update hasta_bakiye_hareket
  set iskonto_tutari = p_iskonto_tutari,
      iskonto_uygulayan_kullanici_id = app_kullanici_id(),
      aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
  where id = p_hareket_id;

  -- Zaten faturalanmış borç: fatura tutarı borçla HER ZAMAN eşitlenir ("faturalı" kutusundan bağımsız).
  if v_hareket.odeme_id is not null then
    if v_net_toplam <= 0 then
      raise exception 'fatura_tutari_sifir';
    end if;
    update odeme set iskonto_tutari = p_iskonto_tutari, aciklama = coalesce(nullif(p_aciklama, ''), aciklama)
      where id = v_hareket.odeme_id;
    update odeme_satiri set tutar = v_net_toplam where odeme_id = v_hareket.odeme_id;
    return;
  end if;

  if not p_faturali then
    return;
  end if;

  if v_net_toplam <= 0 then
    raise exception 'fatura_tutari_sifir';
  end if;

  if v_hareket.randevu_id is not null then
    select * into v_randevu from randevu where id = v_hareket.randevu_id;
    if found and v_randevu.islem_tanimi_id is not null then
      select * into v_islem from islem_tanimi where id = v_randevu.islem_tanimi_id;
      if found then
        v_kalem_aciklama := coalesce(nullif(v_islem.muhasebe_hizmet_ismi, ''), v_islem.ad);
        v_kdv_orani := v_islem.kdv_orani;
      end if;
    end if;
  end if;
  v_kalem_aciklama := coalesce(v_kalem_aciklama, v_hareket.aciklama, 'Borç');

  select * into v_hasta from hasta where id = v_hareket.hasta_id;

  select (kimlik_no is not null and kimlik_no <> ''), (adres is not null and adres <> '')
    into v_kimlik_var, v_adres_var
    from hasta_hassas where hasta_id = v_hareket.hasta_id;

  if v_hasta.ad_soyad is null or v_hasta.ad_soyad = '' then
    v_eksikler := array_append(v_eksikler, 'ad_soyad');
  end if;
  if v_hasta.eposta is null or v_hasta.eposta = '' then
    v_eksikler := array_append(v_eksikler, 'eposta');
  end if;
  if not coalesce(v_adres_var, false) then
    v_eksikler := array_append(v_eksikler, 'adres');
  end if;
  if not coalesce(v_kimlik_var, false) then
    v_eksikler := array_append(v_eksikler, 'kimlik_no');
  end if;

  if array_length(v_eksikler, 1) > 0 then
    raise exception 'fatura_bilgisi_eksik: %', array_to_string(v_eksikler, ',');
  end if;

  insert into odeme (klinik_id, hasta_id, olusturan_kullanici_id, iskonto_tutari, faturali, aciklama)
  values (v_klinik_id, v_hareket.hasta_id, app_kullanici_id(), p_iskonto_tutari, true, p_aciklama)
  returning id into v_odeme_id;

  insert into odeme_kalemi (odeme_id, islem_tanimi_id, aciklama, miktar, birim_fiyat, kdv_orani)
  values (v_odeme_id, v_islem.id, v_kalem_aciklama, 1, v_hareket.tutar, v_kdv_orani);

  insert into odeme_satiri (odeme_id, yontem, tutar)
  values (v_odeme_id, 'nakit', v_net_toplam);

  update hasta_bakiye_hareket set odeme_id = v_odeme_id where id = p_hareket_id;

  insert into fatura (klinik_id, odeme_id, durum)
  values (v_klinik_id, v_odeme_id, 'bekliyor');
end;
$function$
;

CREATE FUNCTION public.mesaj_kredi_yukle(p_klinik_id uuid, p_kanal mesaj_kanal_tipi, p_miktar integer, p_tutar numeric, p_aciklama text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_miktar <= 0 THEN
    RAISE EXCEPTION 'miktar_gecersiz';
  END IF;

  INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye)
  VALUES (p_klinik_id, p_kanal, p_miktar)
  ON CONFLICT (klinik_id, kanal)
  DO UPDATE SET bakiye = mesaj_kredileri.bakiye + EXCLUDED.bakiye, updated_at = now();

  INSERT INTO mesaj_kredi_hareketleri (klinik_id, kanal, tip, miktar, tutar, aciklama, olusturan_kullanici_id)
  VALUES (p_klinik_id, p_kanal, 'yukleme', p_miktar, p_tutar, p_aciklama, app_kullanici_id());
END;
$function$
;

CREATE FUNCTION public.mesaj_kredi_senkronla(p_klinik_id uuid, p_kanal mesaj_kanal_tipi, p_bakiye integer, p_versiyon bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCEsistem_baglami()OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye, son_senkron_zamani, merkez_bakiye_versiyonu)
  VALUES (p_klinik_id, p_kanal, p_bakiye, now(), p_versiyon)
  ON CONFLICT (klinik_id, kanal) DO UPDATE
  SET bakiye = EXCLUDED.bakiye,
      son_senkron_zamani = EXCLUDED.son_senkron_zamani,
      merkez_bakiye_versiyonu = EXCLUDED.merkez_bakiye_versiyonu,
      updated_at = now()
  WHERE mesaj_kredileri.merkez_bakiye_versiyonu < EXCLUDED.merkez_bakiye_versiyonu;
END;
$function$
;

CREATE FUNCTION public.personel_izin_hak_gun_hesapla(p_personel_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p.ise_giris_tarihi is null then 14
    else greatest(
      case
        when age(current_date, p.ise_giris_tarihi) < interval '1 year' then 0
        when age(current_date, p.ise_giris_tarihi) < interval '5 years' then 14
        when age(current_date, p.ise_giris_tarihi) < interval '15 years' then 20
        else 26
      end,
      case
        when p.dogum_tarihi is not null and age(current_date, p.dogum_tarihi) >= interval '50 years' then 20
        else 0
      end
    )
  end
  from personel p
  where p.id = p_personel_id;
$function$
;

CREATE FUNCTION public.personel_izin_is_gunu_sayisi(p_baslangic date, p_bitis date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid := current_klinik_id();
  v_klinik klinik%rowtype;
  v_gun date;
  v_sayac integer := 0;
  v_dow integer;
begin
  if p_bitis < p_baslangic then
    raise exception 'tarih_araligi_gecersiz';
  end if;

  if p_bitis - p_baslangic > 366 then
    raise exception 'tarih_araligi_cok_uzun';
  end if;

  select * into v_klinik from klinik where id = v_klinik_id;

  v_gun := p_baslangic;
  while v_gun <= p_bitis loop
    v_dow := extract(dow from v_gun)::int;
    if (v_dow = 0 and v_klinik.pazar_baslangic is null)
       or (v_dow = 6 and v_klinik.cumartesi_baslangic is null) then
      null;
    elsif exists (
      select 1 from resmi_tatil rt
      where rt.tarih = v_gun and (rt.klinik_id is null or rt.klinik_id = v_klinik_id)
    ) then
      null;
    else
      v_sayac := v_sayac + 1;
    end if;
    v_gun := v_gun + 1;
  end loop;

  return v_sayac;
end;
$function$
;

CREATE FUNCTION public.personel_izin_cakisanlari_getir(p_talep_id uuid)
 RETURNS TABLE(personel_id uuid, ad_soyad text, baslangic_tarih date, bitis_tarih date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.ad_soyad, t.baslangic_tarih, t.bitis_tarih
  from personel_izin_talebi hedef
  join personel_izin_talebi t
    on t.klinik_id = hedef.klinik_id
   and t.id <> hedef.id
   and t.personel_id <> hedef.personel_id
   and t.durum = 'onaylandi'
   and t.baslangic_tarih <= hedef.bitis_tarih
   and t.bitis_tarih >= hedef.baslangic_tarih
  join personel p on p.id = t.personel_id
  where hedef.id = p_talep_id
    and (hedef.klinik_id = current_klinik_id() or is_super_admin())
  order by t.baslangic_tarih;
$function$
;

CREATE FUNCTION public.personel_izin_talep_olustur(p_personel_id uuid, p_tip text, p_baslangic_tarih date, p_bitis_tarih date, p_gerekce text DEFAULT NULL::text, p_belge_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_personel personel%rowtype;
  v_klinik_id uuid := current_klinik_id();
  v_gun_sayisi numeric;
  v_yeni_id uuid;
begin
  select * into v_personel from personel where id = p_personel_id;
  if not found or (v_personel.klinik_id <> v_klinik_id and not is_super_admin()) then
    raise exception 'personel_bulunamadi';
  end if;

  if not coalesce(
    current_rol() in ('klinik_admin', 'muhasebe')
    or v_personel.kullanici_id = app_kullanici_id()
    or is_super_admin(),
    false
  ) then
    raise exception 'yetkisiz';
  end if;

  if p_tip not in ('yillik', 'mazeret', 'ucretsiz', 'idari', 'telafi') then
    raise exception 'tip_gecersiz';
  end if;

  if p_bitis_tarih < p_baslangic_tarih then
    raise exception 'tarih_araligi_gecersiz';
  end if;

  v_gun_sayisi := personel_izin_is_gunu_sayisi(p_baslangic_tarih, p_bitis_tarih);
  if v_gun_sayisi <= 0 then
    raise exception 'gun_sayisi_sifir';
  end if;

  insert into personel_izin_talebi (
    klinik_id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url
  ) values (
    v_klinik_id, p_personel_id, p_tip, p_baslangic_tarih, p_bitis_tarih, v_gun_sayisi, p_gerekce, p_belge_url
  )
  returning id into v_yeni_id;

  return v_yeni_id;
end;
$function$
;

CREATE FUNCTION public.personel_izin_talep_iptal_et(p_talep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_talep personel_izin_talebi%rowtype;
  v_personel personel%rowtype;
begin
  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found then
    raise exception 'talep_bulunamadi';
  end if;

  select * into v_personel from personel where id = v_talep.personel_id;

  if not coalesce(v_personel.kullanici_id = app_kullanici_id() or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  update personel_izin_talebi
  set durum = 'iptal', iptal_eden_kullanici_id = app_kullanici_id(), iptal_tarihi = now()
  where id = p_talep_id;
end;
$function$
;

CREATE FUNCTION public.personel_izin_talebi_onayla(p_talep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_talep personel_izin_talebi%rowtype;
  v_klinik klinik%rowtype;
  v_gun date;
  v_dow integer;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  -- 1. geçiş: kapalı dönem var mı kontrol et, HİÇBİR ŞEY YAZMADAN önce.
  v_gun := v_talep.baslangic_tarih;
  while v_gun <= v_talep.bitis_tarih loop
    if not personel_puantaj_donemi_acik_mi(v_talep.personel_id, v_gun) then
      raise exception 'donem_kapali: %', to_char(v_gun, 'YYYY-MM');
    end if;
    v_gun := v_gun + 1;
  end loop;

  select * into v_klinik from klinik where id = v_talep.klinik_id;

  -- 2. geçiş: sadece sayılan iş günlerine (hafta tatili/resmi tatil hariç) yaz.
  v_gun := v_talep.baslangic_tarih;
  while v_gun <= v_talep.bitis_tarih loop
    v_dow := extract(dow from v_gun)::int;
    if (v_dow = 0 and v_klinik.pazar_baslangic is null)
       or (v_dow = 6 and v_klinik.cumartesi_baslangic is null)
       or exists (
         select 1 from resmi_tatil rt
         where rt.tarih = v_gun and (rt.klinik_id is null or rt.klinik_id = v_talep.klinik_id)
       ) then
      null; -- sayılmayan gün, puantaj satırı yazılmaz
    else
      insert into personel_puantaj (personel_id, tarih, durum, kaynak, izin_talep_id, mola_dakika)
      values (v_talep.personel_id, v_gun, 'izinli', 'izin_talebi', p_talep_id, 0)
      on conflict (personel_id, tarih) do update set
        durum = 'izinli',
        kaynak = 'izin_talebi',
        izin_talep_id = excluded.izin_talep_id,
        giris_saat = null,
        cikis_saat = null;
    end if;
    v_gun := v_gun + 1;
  end loop;

  update personel_izin_talebi
  set durum = 'onaylandi', degerlendiren_kullanici_id = app_kullanici_id(), degerlendirme_tarihi = now()
  where id = p_talep_id;
end;
$function$
;

CREATE FUNCTION public.personel_izin_talebi_reddet(p_talep_id uuid, p_red_gerekce text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_talep personel_izin_talebi%rowtype;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  if p_red_gerekce is null or btrim(p_red_gerekce) = '' then
    raise exception 'red_gerekce_zorunlu';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'beklemede' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  update personel_izin_talebi
  set durum = 'reddedildi', red_gerekce = p_red_gerekce,
      degerlendiren_kullanici_id = app_kullanici_id(), degerlendirme_tarihi = now()
  where id = p_talep_id;
end;
$function$
;

CREATE FUNCTION public.personel_izin_talebi_yonetici_iptal(p_talep_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_talep personel_izin_talebi%rowtype;
begin
  if not coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false) then
    raise exception 'yetkisiz';
  end if;

  select * into v_talep from personel_izin_talebi where id = p_talep_id for update;
  if not found or (v_talep.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'talep_bulunamadi';
  end if;

  if v_talep.durum <> 'onaylandi' then
    raise exception 'gecersiz_durum_gecisi';
  end if;

  if v_talep.baslangic_tarih <= current_date then
    raise exception 'izin_baslamis';
  end if;

  delete from personel_puantaj where izin_talep_id = p_talep_id;

  update personel_izin_talebi
  set durum = 'iptal', iptal_eden_kullanici_id = app_kullanici_id(), iptal_tarihi = now()
  where id = p_talep_id;
end;
$function$
;

CREATE FUNCTION public.personel_hesap_hareket_donem_ekle(p_donem_id uuid, p_hakedis_tutar numeric, p_prim_tutar numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_service boolean :=sistem_baglami();
  v_donem personel_puantaj_donem%rowtype;
begin
  if not (v_is_service or coalesce(current_rol() = 'klinik_admin' or is_super_admin(), false)) then
    raise exception 'yetkisiz';
  end if;

  select * into v_donem from personel_puantaj_donem where id = p_donem_id;
  if not found or (not v_is_service and v_donem.klinik_id <> current_klinik_id() and not is_super_admin()) then
    raise exception 'donem_bulunamadi';
  end if;

  if exists (select 1 from personel_hesap_hareket where kaynak_id = p_donem_id and tur = 'hakedis') then
    raise exception 'zaten_islendi';
  end if;

  if p_hakedis_tutar < 0 then
    raise exception 'tutar_gecersiz';
  end if;

  insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
  values (
    v_donem.klinik_id, v_donem.personel_id, 'hakedis', p_hakedis_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
    format('%s/%s dönemi taban hakediş', v_donem.ay, v_donem.yil), p_donem_id, app_kullanici_id()
  );

  if p_prim_tutar > 0 then
    insert into personel_hesap_hareket (klinik_id, personel_id, tur, tutar, tarih, aciklama, kaynak_id, ekleyen_kullanici_id)
    values (
      v_donem.klinik_id, v_donem.personel_id, 'prim', p_prim_tutar, (make_date(v_donem.yil, v_donem.ay, 1) + interval '1 month' - interval '1 day')::date,
      format('%s/%s dönemi prim', v_donem.ay, v_donem.yil), p_donem_id, app_kullanici_id()
    );
  end if;
end;
$function$
;

CREATE FUNCTION public.pozisyon_pasif_engelle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.aktif = false and old.aktif = true then
    if exists (select 1 from personel where pozisyon_id = new.id and aktif = true) then
      raise exception 'pozisyon_personel_bagli';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE FUNCTION public.klinik_pozisyonlari_seed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into pozisyonlar (klinik_id, sablon_id, ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu)
  select new.id, s.id, s.ad, s.grup, s.sira, s.sistem_erisimi, s.varsayilan_rol, s.ucret_tipi, s.puantaj_modu
  from pozisyon_sablonlari s;
  return new;
end;
$function$
;

CREATE FUNCTION public.klinik_qr_kisa_kod_uret()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE FUNCTION public.klinik_qr_kisa_kod_varsayilan()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.qr_kisa_kod IS NULL THEN
    NEW.qr_kisa_kod := klinik_qr_kisa_kod_uret();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.klinik_qr_bilgisi_getir(p_kisa_kod text)
 RETURNS TABLE(id uuid, ad text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, ad FROM klinik WHERE qr_kisa_kod = p_kisa_kod;
$function$
;

CREATE FUNCTION public.personel_hesap_hareket_ekle(p_personel_id uuid, p_tur text, p_tutar numeric, p_tarih date DEFAULT CURRENT_DATE, p_aciklama text DEFAULT NULL::text, p_odeme_tipi text DEFAULT NULL::text, p_banka_hesap_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_personel personel%rowtype;
  v_yeni_id uuid;
BEGIN
  IF NOT coalesce(current_rol() = 'klinik_admin' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_tur = 'hakedis' THEN
    RAISE EXCEPTION 'hakedis_elle_eklenemez';
  END IF;

  IF p_tur NOT IN ('prim', 'yol', 'yemek', 'mesai', 'avans', 'kesinti', 'odeme') THEN
    RAISE EXCEPTION 'tur_gecersiz';
  END IF;

  IF p_tutar <= 0 THEN
    RAISE EXCEPTION 'tutar_gecersiz';
  END IF;

  IF p_odeme_tipi IS NOT NULL AND p_odeme_tipi NOT IN ('nakit', 'havale') THEN
    RAISE EXCEPTION 'odeme_tipi_gecersiz';
  END IF;

  SELECT * INTO v_personel FROM personel WHERE id = p_personel_id;
  IF NOT found OR (v_personel.klinik_id <> current_klinik_id() AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  INSERT INTO personel_hesap_hareket
    (klinik_id, personel_id, tur, tutar, tarih, aciklama, ekleyen_kullanici_id, odeme_tipi, banka_hesap_id)
  VALUES (
    v_personel.klinik_id, p_personel_id, p_tur, p_tutar, p_tarih, p_aciklama, app_kullanici_id(),
    p_odeme_tipi,
    CASE WHEN p_odeme_tipi = 'havale' THEN p_banka_hesap_id ELSE NULL END
  )
  RETURNING id INTO v_yeni_id;

  RETURN v_yeni_id;
END;
$function$
;

CREATE FUNCTION public.terapist_id_giris_yapan_kullaniciya_ait_mi(p_terapist_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM terapist t
    JOIN personel p ON p.id = t.personel_id
    WHERE t.id = p_terapist_id AND p.kullanici_id = app_kullanici_id()
  );
$function$
;

CREATE FUNCTION public.hasta_yorum_alanlari_doldur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = NEW.randevu_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;
  NEW.klinik_id := v_randevu.klinik_id;
  NEW.hasta_id := v_randevu.hasta_id;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.telefon_normalize(p_telefon text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 10), '');
$function$
;

CREATE FUNCTION public.personel_giris_epostasi(p_telefon text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.email
  FROM kullanici k
  JOIN kimlik_kullanici u ON u.id = k.id
  WHERE k.rol NOT IN ('klinik_admin', 'super_admin')
    AND telefon_normalize(k.telefon) = telefon_normalize(p_telefon)
    AND telefon_normalize(p_telefon) IS NOT NULL
  LIMIT 1;
$function$
;

CREATE FUNCTION public.kasa_bakiye_once_toplam(p_once_tarih date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts;

  v_toplam := v_toplam - coalesce((
    select sum(h.tutar) from hasta_bakiye_hareket h
    where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'nakit' and h.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'nakit' and g.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(p.tutar) from personel_hesap_hareket p
    where p.klinik_id = v_klinik_id and p.odeme_tipi = 'nakit' and p.tur in ('odeme', 'avans') and p.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam + coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.hedef_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(n.tutar) from nakit_banka_hareketi n
    where n.klinik_id = v_klinik_id and n.kaynak_kasa = true and n.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam + coalesce((
    select sum(d.tutar) from kasa_dengeleme d
    where d.klinik_id = v_klinik_id and d.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(c.tutar) from klinik_cari_odeme c
    where c.klinik_id = v_klinik_id and c.odeme_tipi = 'nakit' and c.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(k.tutar) from klinik_kredi_karti_odeme k
    where k.klinik_id = v_klinik_id and k.odeme_tipi = 'nakit' and k.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(ko.tutar) from kamusal_odeme ko
    where ko.klinik_id = v_klinik_id and ko.odeme_yontemi = 'nakit'
      and ko.odeme_tarihi is not null and ko.odeme_tarihi < p_once_tarih
  ), 0);

  return v_toplam;
end;
$function$
;

CREATE FUNCTION public.banka_bakiye_once_toplam_tumu(p_once_tarih date)
 RETURNS TABLE(banka_hesap_id uuid, toplam numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  return query
  select
    b.id,
    coalesce((
      select sum(h.tutar) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'banka_havalesi'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    + coalesce((
      select sum(h.tutar - round(h.tutar * coalesce(h.komisyon_orani, 0) / 100, 2)) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    - coalesce((
      select sum(h.tutar) from hasta_bakiye_hareket h
      where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'banka_havalesi'
        and h.banka_hesap_id = b.id and h.created_at < v_once_ts
    ), 0)
    - coalesce((
      select sum(g.tutar) from klinik_harcama g
      where g.klinik_id = v_klinik_id and g.odeme_tipi = 'havale' and g.banka_hesap_id = b.id and g.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(p.tutar) from personel_hesap_hareket p
      where p.klinik_id = v_klinik_id and p.odeme_tipi = 'havale' and p.tur in ('odeme', 'avans')
        and p.banka_hesap_id = b.id and p.tarih < p_once_tarih
    ), 0)
    + coalesce((
      select sum(n.tutar) from nakit_banka_hareketi n
      where n.klinik_id = v_klinik_id and n.hedef_banka_hesap_id = b.id and n.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(n.tutar) from nakit_banka_hareketi n
      where n.klinik_id = v_klinik_id and n.kaynak_banka_hesap_id = b.id and n.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(c.tutar) from klinik_cari_odeme c
      where c.klinik_id = v_klinik_id and c.odeme_tipi = 'havale' and c.banka_hesap_id = b.id and c.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(k.tutar) from klinik_kredi_karti_odeme k
      where k.klinik_id = v_klinik_id and k.odeme_tipi = 'havale' and k.banka_hesap_id = b.id and k.tarih < p_once_tarih
    ), 0)
    - coalesce((
      select sum(ko.tutar) from kamusal_odeme ko
      where ko.klinik_id = v_klinik_id and ko.odeme_yontemi = 'havale' and ko.banka_hesap_id = b.id
        and ko.odeme_tarihi is not null and ko.odeme_tarihi < p_once_tarih
    ), 0)
  from klinik_banka_hesaplari b
  where b.klinik_id = v_klinik_id;
end;
$function$
;

CREATE FUNCTION public.kredi_karti_bakiye_once_toplam(p_once_tarih date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid := current_klinik_id();
  v_once_ts timestamptz := (p_once_tarih::timestamp at time zone 'Europe/Istanbul');
  v_toplam numeric := 0;
begin
  if not (current_rol() in ('klinik_admin', 'muhasebe') or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  select coalesce(sum(h.tutar), 0) into v_toplam
  from hasta_bakiye_hareket h
  where h.klinik_id = v_klinik_id and h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti' and h.created_at < v_once_ts;

  v_toplam := v_toplam - coalesce((
    select sum(h.tutar) from hasta_bakiye_hareket h
    where h.klinik_id = v_klinik_id and h.tur = 'iade' and h.odeme_yontemi = 'kredi_karti' and h.created_at < v_once_ts
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(g.tutar) from klinik_harcama g
    where g.klinik_id = v_klinik_id and g.odeme_tipi = 'kredi_karti' and g.tarih < p_once_tarih
  ), 0);

  v_toplam := v_toplam - coalesce((
    select sum(c.tutar) from klinik_cari_odeme c
    where c.klinik_id = v_klinik_id and c.odeme_tipi = 'kredi_karti' and c.tarih < p_once_tarih
  ), 0);

  return v_toplam;
end;
$function$
;

CREATE FUNCTION public.islem_tanimi_toplam_sure_guncelle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_islem_id uuid := COALESCE(NEW.islem_tanimi_id, OLD.islem_tanimi_id);
BEGIN
  UPDATE islem_tanimi
    SET sure_dakika = (SELECT SUM(sure_dakika) FROM islem_tanimi_adim WHERE islem_tanimi_id = v_islem_id)
    WHERE id = v_islem_id;
  RETURN NULL;
END;
$function$
;

CREATE FUNCTION public.islem_tanimi_kaydet(p_id uuid, p_ad text, p_vita_fiyat numeric, p_plus_fiyat numeric, p_elit_fiyat numeric, p_prime_fiyat numeric, p_kdv_orani numeric, p_muhasebe_hizmet_ismi text, p_adimlar jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_islem_id uuid;
  v_adim jsonb;
  v_sira integer := 0;
  v_gonderilen_id_listesi uuid[] := '{}';
  v_adim_id uuid;
BEGIN
  v_klinik_id := current_klinik_id();

  IF v_klinik_id IS NULL OR (current_rol() <> 'klinik_admin' AND NOT is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF p_adimlar IS NULL OR jsonb_array_length(p_adimlar) = 0 THEN
    RAISE EXCEPTION 'adim_gerekli';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO islem_tanimi
      (klinik_id, ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi)
    VALUES
      (v_klinik_id, p_ad, p_vita_fiyat, p_plus_fiyat, p_elit_fiyat, p_prime_fiyat, p_kdv_orani, p_muhasebe_hizmet_ismi)
    RETURNING id INTO v_islem_id;
  ELSE
    UPDATE islem_tanimi SET
      ad = p_ad,
      vita_fiyat = p_vita_fiyat,
      plus_fiyat = p_plus_fiyat,
      elit_fiyat = p_elit_fiyat,
      prime_fiyat = p_prime_fiyat,
      kdv_orani = p_kdv_orani,
      muhasebe_hizmet_ismi = p_muhasebe_hizmet_ismi
    WHERE id = p_id AND klinik_id = v_klinik_id
    RETURNING id INTO v_islem_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'tedavi_bulunamadi';
    END IF;
  END IF;

  FOR v_adim IN SELECT * FROM jsonb_array_elements(p_adimlar)
  LOOP
    v_sira := v_sira + 1;

    IF NULLIF(v_adim->>'id', '') IS NOT NULL THEN
      UPDATE islem_tanimi_adim SET
        ad = v_adim->>'ad',
        gerekli_cihaz_id = NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        uygulayici_pozisyon_id = NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        sure_dakika = NULLIF(v_adim->>'sure_dakika', '')::integer,
        sira = v_sira
      WHERE id = (v_adim->>'id')::uuid AND islem_tanimi_id = v_islem_id
      RETURNING id INTO v_adim_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'adim_bulunamadi';
      END IF;
    ELSE
      INSERT INTO islem_tanimi_adim (islem_tanimi_id, ad, gerekli_cihaz_id, uygulayici_pozisyon_id, sure_dakika, sira)
      VALUES (
        v_islem_id,
        v_adim->>'ad',
        NULLIF(v_adim->>'gerekli_cihaz_id', '')::uuid,
        NULLIF(v_adim->>'uygulayici_pozisyon_id', '')::uuid,
        NULLIF(v_adim->>'sure_dakika', '')::integer,
        v_sira
      )
      RETURNING id INTO v_adim_id;
    END IF;

    v_gonderilen_id_listesi := v_gonderilen_id_listesi || v_adim_id;
  END LOOP;

  DELETE FROM islem_tanimi_adim
  WHERE islem_tanimi_id = v_islem_id AND NOT (id = ANY(v_gonderilen_id_listesi));

  RETURN v_islem_id;
END;
$function$
;

CREATE FUNCTION public.randevu_seans_bedelini_isle(p_randevu_id uuid, p_odeme_tutari numeric DEFAULT NULL::numeric, p_odeme_yontemi text DEFAULT NULL::text, p_banka_hesap_id uuid DEFAULT NULL::uuid, p_aciklama text DEFAULT NULL::text, p_odeme_tarihi timestamp with time zone DEFAULT NULL::timestamp with time zone, p_belge_turu text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid;
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_zaten_islendi boolean;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
BEGIN
  v_klinik_id := current_klinik_id();

  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = v_klinik_id OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin();
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum != 'tamamlandi' THEN
    RAISE EXCEPTION 'seans_tamamlanmamis';
  END IF;

  v_zaten_islendi := v_randevu.paket_satis_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc'
  );
  IF v_zaten_islendi THEN
    RETURN jsonb_build_object('yontem', 'zaten_islendi', 'hasta_id', v_randevu.hasta_id);
  END IF;

  IF v_randevu.islem_tanimi_id IS NULL THEN
    RETURN jsonb_build_object('yontem', 'yok', 'hasta_id', v_randevu.hasta_id);
  END IF;

  SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
  v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, v_randevu.hasta_id);
  v_iskonto := LEAST(GREATEST(COALESCE(v_randevu.planlanan_iskonto_tutari, 0), 0), v_fiyat);

  INSERT INTO hasta_bakiye_hareket (
    klinik_id, hasta_id, tur, tutar, iskonto_tutari, iskonto_uygulayan_kullanici_id, randevu_id, aciklama
  )
  VALUES (
    v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_fiyat, v_iskonto,
    CASE WHEN v_iskonto > 0 THEN v_randevu.olusturan_kullanici_id ELSE NULL END,
    p_randevu_id,
    'Seans ücreti: ' || v_islem.ad
  );

  IF p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN
    IF p_odeme_yontemi IS NULL OR p_odeme_yontemi NOT IN ('nakit', 'kredi_karti', 'banka_havalesi') THEN
      RAISE EXCEPTION 'odeme_yontemi_gecersiz';
    END IF;
    IF p_belge_turu IS NOT NULL AND p_belge_turu NOT IN ('fatura', 'fis', 'serbest') THEN
      RAISE EXCEPTION 'belge_turu_gecersiz';
    END IF;

    INSERT INTO hasta_bakiye_hareket (
      klinik_id, hasta_id, tur, tutar, randevu_id, aciklama, odeme_yontemi, banka_hesap_id, belge_turu, created_at
    )
    VALUES (
      v_randevu.klinik_id, v_randevu.hasta_id, 'odeme', p_odeme_tutari, p_randevu_id, p_aciklama,
      p_odeme_yontemi, p_banka_hesap_id, p_belge_turu, COALESCE(p_odeme_tarihi, now())
    );
  END IF;

  RETURN jsonb_build_object(
    'yontem', CASE WHEN p_odeme_tutari IS NOT NULL AND p_odeme_tutari > 0 THEN 'odeme' ELSE 'cari' END,
    'hasta_id', v_randevu.hasta_id, 'tutar', v_fiyat, 'iskonto_tutari', v_iskonto
  );
END;
$function$
;

CREATE FUNCTION public.audit_log_degisiklik_yaz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_yeni jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_eski jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_satir jsonb := coalesce(v_yeni, v_eski);
  v_sadece_alan_adi boolean := coalesce(tg_argv[0], '') = 'sadece_alan_adi';
  v_klinik_id uuid;
  v_hedef_id uuid;
  v_degisen text[];
  v_detay jsonb;
begin
  begin
    v_klinik_id := (v_satir ->> 'klinik_id')::uuid;
    -- hasta_hassas'ın PK'sı id değil hasta_id
    v_hedef_id := coalesce(v_satir ->> 'id', v_satir ->> 'hasta_id')::uuid;

    if v_klinik_id is null or not exists (select 1 from klinik where id = v_klinik_id) then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE' then
      select coalesce(array_agg(k order by k), '{}')
        into v_degisen
        from jsonb_object_keys(v_yeni) as k
       where k <> 'updated_at' and (v_yeni -> k) is distinct from (v_eski -> k);

      if coalesce(array_length(v_degisen, 1), 0) = 0 then
        return new;
      end if;

      -- hasta.risk_bayraklari zaten eski trg_musteri_risk_audit ile kaydediliyor
      if tg_table_name = 'hasta' and v_degisen = array['risk_bayraklari'] then
        return new;
      end if;

      v_detay := jsonb_build_object('surum', 2, 'degisen_alanlar', to_jsonb(v_degisen));
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object(
          'eski', (select jsonb_object_agg(k, v_eski -> k) from unnest(v_degisen) as k),
          'yeni', (select jsonb_object_agg(k, v_yeni -> k) from unnest(v_degisen) as k)
        );
      end if;
    elsif tg_op = 'INSERT' then
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('yeni', v_yeni);
      end if;
    else
      v_detay := jsonb_build_object('surum', 2);
      if not v_sadece_alan_adi then
        v_detay := v_detay || jsonb_build_object('eski', v_eski);
      end if;
    end if;

    -- UPDATE'te yalnız değişen alanlar tutulduğundan satırın hangi hastaya ait
    -- olduğu kaybolmasın (panel "Hasta" sütunu) — bağlam alanı olarak her zaman eklenir.
    if v_satir ->> 'hasta_id' is not null then
      v_detay := v_detay || jsonb_build_object('hasta_id', v_satir ->> 'hasta_id');
    end if;

    insert into audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
    values (v_klinik_id, app_kullanici_id(), lower(tg_op), tg_table_name, v_hedef_id, v_detay);
  exception when others then
    raise warning 'audit_log_degisiklik_yaz hatası (% %): %', tg_table_name, tg_op, sqlerrm;
  end;

  return coalesce(new, old);
end;
$function$
;

CREATE FUNCTION public.hiz_siniri_kullan(p_anahtar text, p_limit integer, p_pencere_sn integer, p_artir boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pencere timestamptz;
  v_sayac integer;
BEGIN
  IF p_anahtar IS NULL OR length(p_anahtar) > 200 OR p_limit < 1 OR p_pencere_sn < 1 THEN
    RAISE EXCEPTION 'hiz_siniri_parametre_gecersiz';
  END IF;

  v_pencere := to_timestamp(floor(extract(epoch FROM now()) / p_pencere_sn) * p_pencere_sn);

  IF p_artir THEN
    INSERT INTO hiz_siniri_sayac (anahtar, pencere_baslangic, sayac)
    VALUES (p_anahtar, v_pencere, 1)
    ON CONFLICT (anahtar, pencere_baslangic)
    DO UPDATE SET sayac = hiz_siniri_sayac.sayac + 1
    RETURNING sayac INTO v_sayac;

    -- Fırsatçı temizlik (~%1 çağrıda): cron gerektirmeden tablo şişmez.
    IF random() < 0.01 THEN
      DELETE FROM hiz_siniri_sayac WHERE pencere_baslangic < now() - interval '2 days';
    END IF;

    RETURN v_sayac <= p_limit;
  END IF;

  SELECT sayac INTO v_sayac
  FROM hiz_siniri_sayac
  WHERE anahtar = p_anahtar AND pencere_baslangic = v_pencere;

  RETURN COALESCE(v_sayac, 0) < p_limit;
END;
$function$
;

CREATE FUNCTION public.audit_log_bolum_olustur(p_ileri_ay integer DEFAULT 3, p_baslangic date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ay date;
  v_son date;
  v_ad text;
  v_olusan text[] := '{}';
  v_varsayilan bigint;
begin
  v_ay := date_trunc('month', coalesce(p_baslangic::timestamp, now() at time zone 'UTC'))::date;
  v_son := date_trunc('month', (now() at time zone 'UTC') + make_interval(months => p_ileri_ay))::date;

  while v_ay <= v_son loop
    v_ad := 'audit_log_' || to_char(v_ay, 'YYYY_MM');
    if to_regclass(format('public.%I', v_ad)) is null then
      execute format(
        'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
        v_ad,
        (v_ay::timestamp at time zone 'UTC'),
        ((v_ay + interval '1 month')::timestamp at time zone 'UTC')
      );
      -- Partition doğrudan API'den erişilemesin (bkz. yukarıdaki güvenlik notu)
      execute format('alter table public.%I enable row level security', v_ad);
      execute format('revoke all on table public.%I from anon, authenticated', v_ad);
      v_olusan := v_olusan || v_ad;
    end if;
    v_ay := (v_ay + interval '1 month')::date;
  end loop;

  select count(*) into v_varsayilan
  from (select 1 from public.audit_log_varsayilan limit 1000) s;

  return jsonb_build_object('olusturulan', to_jsonb(v_olusan), 'varsayilan_satir', v_varsayilan);
end;
$function$
;

CREATE FUNCTION public.randevu_cihaz_rezervasyon_yenile(p_randevu_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r randevu%ROWTYPE;
  v_adim record;
  v_imlec timestamptz;
  v_adim_bitis timestamptz;
  v_adim_penceresi_var boolean := false;
BEGIN
  DELETE FROM randevu_cihaz_rezervasyon WHERE randevu_id = p_randevu_id;

  SELECT * INTO v_r FROM randevu WHERE id = p_randevu_id;
  IF NOT FOUND OR v_r.durum IN ('iptal', 'gelmedi') THEN
    RETURN;
  END IF;

  IF v_r.kaynak <> 'arsiv' AND v_r.islem_tanimi_id IS NOT NULL THEN
    v_imlec := v_r.baslangic;

    FOR v_adim IN
      SELECT id, gerekli_cihaz_id, sure_dakika
      FROM islem_tanimi_adim
      WHERE islem_tanimi_id = v_r.islem_tanimi_id
      ORDER BY sira, id
    LOOP
      -- Pencere TEDAVİ TANIMINDAKİ süreden gelir; randevu formunda elle
      -- değiştirilen süre (randevu.bitis) pencereyi kırpmaz/uzatmaz.
      IF v_adim.sure_dakika IS NULL THEN
        -- Tanımda süresi girilmemiş adım: kalan randevu süresini kilitle
        -- (muhafazakâr), sonrası boş kalır.
        v_adim_bitis := GREATEST(v_r.bitis, v_imlec);
      ELSE
        v_adim_bitis := v_imlec + make_interval(mins => v_adim.sure_dakika);
      END IF;

      IF v_adim.gerekli_cihaz_id IS NOT NULL AND v_imlec < v_adim_bitis THEN
        INSERT INTO randevu_cihaz_rezervasyon (klinik_id, randevu_id, cihaz_id, adim_id, tur, baslangic, bitis)
        VALUES (v_r.klinik_id, v_r.id, v_adim.gerekli_cihaz_id, v_adim.id, 'adim', v_imlec, v_adim_bitis);
        v_adim_penceresi_var := true;
      END IF;

      v_imlec := v_adim_bitis;
    END LOOP;
  END IF;

  -- Elle seçilen cihaz (randevu.cihaz_id) yalnız GERİ UYUM içindir: tedavi
  -- tanımında cihazlı adım yoksa (eski tedaviler, tedavisiz randevu, arşiv)
  -- eski davranış korunur. Tanımda cihaz varsa tanım esastır, elle seçim
  -- rezervasyon üretmez.
  IF v_r.cihaz_id IS NOT NULL AND NOT v_adim_penceresi_var THEN
    INSERT INTO randevu_cihaz_rezervasyon (klinik_id, randevu_id, cihaz_id, adim_id, tur, baslangic, bitis)
    VALUES (v_r.klinik_id, v_r.id, v_r.cihaz_id, NULL, 'manuel', v_r.baslangic, v_r.bitis);
  END IF;
END;
$function$
;

CREATE FUNCTION public.randevu_cihaz_rezervasyon_tetikle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM randevu_cihaz_rezervasyon_yenile(NEW.id);
  RETURN NULL;
END;
$function$
;

CREATE FUNCTION public.personel_puantaj_kendi_kaydet(p_tur text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_personel personel%ROWTYPE;
  v_saat timestamptz := now();
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_mevcut personel_puantaj%ROWTYPE;
BEGIN
  IF app_kullanici_id() IS NULL THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;
  IF p_tur IS NULL OR p_tur NOT IN ('giris', 'cikis') THEN
    RAISE EXCEPTION 'tur_gecersiz';
  END IF;

  SELECT * INTO v_personel FROM personel p
  WHERE p.kullanici_id = app_kullanici_id()
    AND p.aktif
    AND (p.isten_cikis_tarihi IS NULL OR p.isten_cikis_tarihi >= v_bugun)
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personel_bulunamadi';
  END IF;

  IF NOT personel_puantaj_donemi_acik_mi(v_personel.id, v_bugun) THEN
    RAISE EXCEPTION 'donem_kapali';
  END IF;

  -- Onaylı izin günü: onay anında iş günlerine 'izinli' satır yazılır, ama
  -- hafta sonu/tatile denk gelen izin günlerinde satır olmayabilir → talebe de bakılır.
  IF EXISTS (
    SELECT 1 FROM personel_izin_talebi t
    WHERE t.personel_id = v_personel.id
      AND t.durum = 'onaylandi'
      AND t.baslangic_tarih <= v_bugun
      AND t.bitis_tarih >= v_bugun
  ) THEN
    RAISE EXCEPTION 'izinli_gun';
  END IF;

  SELECT * INTO v_mevcut FROM personel_puantaj
  WHERE personel_id = v_personel.id AND tarih = v_bugun
  FOR UPDATE;

  IF FOUND AND v_mevcut.durum IN ('izinli', 'raporlu') THEN
    RAISE EXCEPTION 'izinli_gun';
  END IF;

  IF p_tur = 'giris' THEN
    IF FOUND AND v_mevcut.giris_saat IS NOT NULL THEN
      RAISE EXCEPTION 'giris_zaten_var';
    END IF;
    IF FOUND THEN
      UPDATE personel_puantaj
      SET giris_saat = v_saat, durum = 'calisti', kaynak = 'self_qr'
      WHERE id = v_mevcut.id;
    ELSE
      INSERT INTO personel_puantaj (personel_id, tarih, giris_saat, durum, kaynak)
      VALUES (v_personel.id, v_bugun, v_saat, 'calisti', 'self_qr');
    END IF;
  ELSE
    IF NOT FOUND OR v_mevcut.giris_saat IS NULL THEN
      RAISE EXCEPTION 'once_giris_gerekli';
    END IF;
    IF v_mevcut.cikis_saat IS NOT NULL THEN
      RAISE EXCEPTION 'cikis_zaten_var';
    END IF;
    IF v_saat <= v_mevcut.giris_saat THEN
      RAISE EXCEPTION 'cikis_giristen_once';
    END IF;
    UPDATE personel_puantaj SET cikis_saat = v_saat WHERE id = v_mevcut.id;
  END IF;

  RETURN jsonb_build_object('ad_soyad', v_personel.ad_soyad, 'tur', p_tur, 'saat', v_saat);
END;
$function$
;

CREATE FUNCTION public.rapor_donem_ozeti(p_baslangic timestamp with time zone, p_bitis timestamp with time zone, p_baslangic_tarih date, p_bitis_tarih date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with k as (select current_klinik_id() as id),
  tahsilat as (
    select
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'nakit'), 0) as nakit,
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'kredi_karti'), 0) as kredi_karti,
      coalesce(sum(h.tutar) filter (where h.tur = 'odeme' and h.odeme_yontemi = 'banka_havalesi'), 0) as banka_havalesi,
      coalesce(sum(h.tutar) filter (
        where h.tur = 'odeme' and (h.odeme_yontemi is null or h.odeme_yontemi not in ('nakit', 'kredi_karti', 'banka_havalesi'))
      ), 0) as belirtilmemis,
      coalesce(sum(h.tutar) filter (where h.tur = 'iade'), 0) as iade
    from hasta_bakiye_hareket h, k
    where h.klinik_id = k.id
      and h.tur in ('odeme', 'iade')
      and h.created_at >= p_baslangic and h.created_at < p_bitis
  ),
  harcama as (
    select
      coalesce(sum(g.tutar) filter (where g.kategori <> 'diger' and g.is_faturali = false), 0) as isletme,
      coalesce(sum(g.tutar) filter (where g.kategori = 'diger' and g.is_faturali = false), 0) as diger,
      coalesce(sum(g.tutar) filter (where g.is_faturali = true), 0) as faturali
    from klinik_harcama g, k
    where g.klinik_id = k.id
      and g.tarih >= p_baslangic_tarih and g.tarih < p_bitis_tarih
  ),
  kamusal as (
    select coalesce(sum(o.tutar), 0) as muhasebe
    from kamusal_odeme o, k
    where o.klinik_id = k.id
      and o.odeme_tarihi is not null
      and o.odeme_tarihi >= p_baslangic_tarih and o.odeme_tarihi < p_bitis_tarih
  ),
  randevu_ozet as (
    select
      count(*) filter (where r.durum in ('geldi', 'gecikmeli_geldi', 'tamamlandi')) as tamamlanan,
      count(*) filter (where r.durum = 'planlandi') as planlanan,
      count(*) filter (where r.durum = 'ertelendi') as ertelenen,
      count(*) filter (where r.durum in ('iptal', 'gelmedi')) as iptal_ve_gelmedi,
      count(*) as toplam
    from randevu r, k
    where r.klinik_id = k.id
      and r.baslangic >= p_baslangic and r.baslangic < p_bitis
  )
  select jsonb_build_object(
    'gelir', jsonb_build_object(
      'nakit', t.nakit,
      'kredi_karti', t.kredi_karti,
      'banka_havalesi', t.banka_havalesi,
      'belirtilmemis', t.belirtilmemis,
      'iade', t.iade
    ),
    'isletme_gideri', g.isletme,
    'diger_giderler', g.diger,
    'faturali_giderler', g.faturali,
    'muhasebe_gideri', m.muhasebe,
    'randevu', jsonb_build_object(
      'tamamlanan', r.tamamlanan,
      'planlanan', r.planlanan,
      'ertelenen', r.ertelenen,
      'iptal_ve_gelmedi', r.iptal_ve_gelmedi,
      'toplam', r.toplam
    )
  )
  from tahsilat t, harcama g, kamusal m, randevu_ozet r;
$function$
;

CREATE FUNCTION public.rapor_yillik_ozet(p_yil integer)
 RETURNS TABLE(ay integer, gelir numeric, gider numeric, seans_sayisi integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with k as (select current_klinik_id() as id),
  aylar as (select generate_series(1, 12) as ay),
  -- İstanbul takvim yılının sınırları (timestamptz kolonlar için)
  sinir as (
    select
      (make_date(p_yil, 1, 1)::timestamp at time zone 'Europe/Istanbul') as bas_ts,
      (make_date(p_yil + 1, 1, 1)::timestamp at time zone 'Europe/Istanbul') as bit_ts,
      make_date(p_yil, 1, 1) as bas_t,
      make_date(p_yil + 1, 1, 1) as bit_t
  ),
  tahsilat as (
    select extract(month from (h.created_at at time zone 'Europe/Istanbul'))::int as ay,
           sum(case when h.tur = 'iade' then -h.tutar else h.tutar end) as tutar
    from hasta_bakiye_hareket h, k, sinir s
    where h.klinik_id = k.id and h.tur in ('odeme', 'iade')
      and h.created_at >= s.bas_ts and h.created_at < s.bit_ts
    group by 1
  ),
  gider as (
    select ay, sum(tutar) as tutar from (
      select extract(month from g.tarih)::int as ay, g.tutar
      from klinik_harcama g, k, sinir s
      where g.klinik_id = k.id and g.tarih >= s.bas_t and g.tarih < s.bit_t
      union all
      select extract(month from o.odeme_tarihi)::int, o.tutar
      from kamusal_odeme o, k, sinir s
      where o.klinik_id = k.id and o.odeme_tarihi is not null
        and o.odeme_tarihi >= s.bas_t and o.odeme_tarihi < s.bit_t
    ) x
    group by ay
  ),
  seans as (
    select extract(month from (r.baslangic at time zone 'Europe/Istanbul'))::int as ay, count(*)::int as sayi
    from randevu r, k, sinir s
    where r.klinik_id = k.id and r.durum in ('geldi', 'gecikmeli_geldi', 'tamamlandi')
      and r.baslangic >= s.bas_ts and r.baslangic < s.bit_ts
    group by 1
  )
  select a.ay,
         coalesce(t.tutar, 0)::numeric,
         coalesce(g.tutar, 0)::numeric,
         coalesce(se.sayi, 0)
  from aylar a
  left join tahsilat t on t.ay = a.ay
  left join gider g on g.ay = a.ay
  left join seans se on se.ay = a.ay
  order by a.ay;
$function$
;

CREATE FUNCTION public.turkce_arama_metni(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select lower(translate(coalesce(p, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu'));
$function$
;

CREATE FUNCTION public.hasta_ara(p_sorgu text, p_limit integer DEFAULT 8)
 RETURNS SETOF hasta
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    select
      -- LIKE joker karakterleri arama metninden çıkarılır
      trim(regexp_replace(turkce_arama_metni(p_sorgu), '[%_\\]', ' ', 'g')) as metin,
      regexp_replace(coalesce(p_sorgu, ''), '\D', '', 'g') as rakam
  ),
  q2 as (
    select
      metin,
      -- "0532 123 45 67" / "+90 532..." → "5321234567" (lib/utils.ts > telefonYerelHaneleriCikar ile aynı)
      left(ltrim(case when length(rakam) > 10 and left(rakam, 2) = '90' then substr(rakam, 3) else rakam end, '0'), 10) as tel
    from q
  )
  select h.*
  from hasta h, q2
  where length(q2.metin) > 0
    and (
      turkce_arama_metni(h.ad_soyad) like '%' || q2.metin || '%'
      or (length(q2.metin) >= 3 and word_similarity(q2.metin, turkce_arama_metni(h.ad_soyad)) >= 0.4)
      or (length(q2.tel) >= 3 and h.telefon like '%' || q2.tel || '%')
    )
  order by
    (turkce_arama_metni(h.ad_soyad) like q2.metin || '%') desc,
    (turkce_arama_metni(h.ad_soyad) like '%' || q2.metin || '%') desc,
    word_similarity(q2.metin, turkce_arama_metni(h.ad_soyad)) desc,
    h.ad_soyad
  limit least(greatest(coalesce(p_limit, 8), 1), 100);
$function$
;

CREATE FUNCTION public.gelmeme_analizi(p_baslangic timestamp with time zone, p_bitis timestamp with time zone)
 RETURNS TABLE(boyut text, anahtar text, etiket text, gerceklesen integer, gelmedi integer, gecikmeli integer, iptal integer, ertelendi integer, isaretlenmemis integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if not (current_rol() = 'klinik_admin' or is_super_admin()) then
    raise exception 'yetkisiz';
  end if;

  return query
  with r as (
    select
      ra.id,
      ra.durum::text as durum,
      ra.terapist_id,
      ra.hasta_id,
      (ra.baslangic at time zone 'Europe/Istanbul') as yerel
    from randevu ra
    where ra.klinik_id = current_klinik_id()
      and ra.baslangic >= p_baslangic
      and ra.baslangic < least(p_bitis, now())
  ),
  s as (
    select
      r.*,
      (r.durum in ('geldi', 'gecikmeli_geldi', 'seansta', 'tamamlandi'))::int as g_gerceklesen,
      (r.durum = 'gelmedi')::int as g_gelmedi,
      (r.durum = 'gecikmeli_geldi')::int as g_gecikmeli,
      (r.durum = 'iptal')::int as g_iptal,
      (r.durum = 'ertelendi')::int as g_ertelendi,
      (r.durum = 'planlandi')::int as g_isaretlenmemis
    from r
  ),
  kirilim as (
    select 'toplam'::text as boyut, 'toplam'::text as anahtar, 'Toplam'::text as etiket,
           sum(g_gerceklesen) as a, sum(g_gelmedi) as b, sum(g_gecikmeli) as c,
           sum(g_iptal) as d, sum(g_ertelendi) as e, sum(g_isaretlenmemis) as f
    from s
    union all
    select 'terapist', coalesce(s.terapist_id::text, '-'), coalesce(max(p.ad_soyad), 'Terapist atanmamış'),
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s
    left join terapist t on t.id = s.terapist_id
    left join personel p on p.id = t.personel_id
    group by s.terapist_id
    union all
    select 'saat', lpad(extract(hour from yerel)::int::text, 2, '0'), lpad(extract(hour from yerel)::int::text, 2, '0') || ':00',
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by extract(hour from yerel)
    union all
    select 'gun', extract(isodow from yerel)::int::text, extract(isodow from yerel)::int::text,
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by extract(isodow from yerel)
    union all
    select 'ay', to_char(yerel, 'YYYY-MM'), to_char(yerel, 'YYYY-MM'),
           sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
    from s group by to_char(yerel, 'YYYY-MM')
    union all
    select * from (
      select 'hasta'::text, s.hasta_id::text, coalesce(max(h.ad_soyad), 'Hasta'),
             sum(g_gerceklesen), sum(g_gelmedi), sum(g_gecikmeli), sum(g_iptal), sum(g_ertelendi), sum(g_isaretlenmemis)
      from s
      join hasta h on h.id = s.hasta_id
      group by s.hasta_id
      having sum(g_gelmedi) >= 2
      order by sum(g_gelmedi) desc, coalesce(max(h.ad_soyad), 'Hasta')
      limit 10
    ) tekrar
  )
  select k.boyut, k.anahtar, k.etiket,
         coalesce(k.a, 0)::int, coalesce(k.b, 0)::int, coalesce(k.c, 0)::int,
         coalesce(k.d, 0)::int, coalesce(k.e, 0)::int, coalesce(k.f, 0)::int
  from kirilim k;
end;
$function$
;

CREATE FUNCTION public.randevu_iptal_talebi_gec_iptal_ata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT (r.baslangic - now()) < interval '18 hours' INTO NEW.gec_iptal
  FROM randevu r WHERE r.id = NEW.randevu_id;
  NEW.gec_iptal := COALESCE(NEW.gec_iptal, false);
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.randevu_iptal_geri_al(p_randevu_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT ((v_randevu.klinik_id = current_klinik_id() AND current_rol() = 'klinik_admin') OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum <> 'iptal' THEN
    RAISE EXCEPTION 'randevu_iptal_degil';
  END IF;

  IF v_randevu.iptal_borc_yazildi THEN
    IF EXISTS (
      SELECT 1 FROM hasta_bakiye_hareket
      WHERE randevu_id = p_randevu_id AND tur = 'borc' AND odeme_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'borc_faturali_geri_alinamaz';
    END IF;
    DELETE FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc';
  END IF;

  IF v_randevu.iptal_paket_dusuldu AND v_randevu.paket_satis_id IS NOT NULL THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
  END IF;

  UPDATE randevu
  SET durum = 'planlandi',
      iptal_aciklamasi = NULL,
      iptal_tarihi = NULL,
      iptal_eden_kullanici_id = NULL,
      gec_iptal = false,
      bedelli_iptal = false,
      iptal_paket_dusuldu = false,
      iptal_borc_yazildi = false,
      paket_satis_id = CASE WHEN v_randevu.iptal_paket_dusuldu THEN NULL ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id,
    'paket_iade', v_randevu.iptal_paket_dusuldu, 'borc_silindi', v_randevu.iptal_borc_yazildi);
END;
$function$
;

CREATE FUNCTION public.randevu_iptal_et(p_randevu_id uuid, p_aciklama text DEFAULT NULL::text, p_bedelli boolean DEFAULT false, p_gec_iptal boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_gec boolean;
  v_paket paket_satis%ROWTYPE;
  v_islem islem_tanimi%ROWTYPE;
  v_fiyat numeric;
  v_iskonto numeric;
  v_dusuldu boolean := false;
  v_borc boolean := false;
  v_iade boolean := false;
  v_aciklama text := NULLIF(btrim(COALESCE(p_aciklama, '')), '');
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = current_klinik_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND NOT COALESCE(p_bedelli, false) AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = app_kullanici_id()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum = 'iptal' THEN
    RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'zaten_iptal', true,
      'bedelli', v_randevu.bedelli_iptal, 'paket_dusuldu', v_randevu.iptal_paket_dusuldu,
      'borc_yazildi', v_randevu.iptal_borc_yazildi);
  END IF;
  IF v_randevu.durum = 'tamamlandi' THEN
    RAISE EXCEPTION 'tamamlanmis_randevu_iptal_edilemez';
  END IF;

  v_gec := COALESCE(p_gec_iptal, (v_randevu.baslangic - now()) < interval '18 hours');

  IF COALESCE(p_bedelli, false) THEN
    v_aciklama := CASE WHEN v_aciklama IS NULL THEN '(geç iptal)' ELSE v_aciklama || ' (geç iptal)' END;

    -- Check-in'de zaten paketten düşüldüyse (paket_satis_id dolu) ikinci kez düşülmez.
    IF v_randevu.paket_satis_id IS NULL AND v_randevu.islem_tanimi_id IS NOT NULL AND v_randevu.hasta_id IS NOT NULL THEN
      SELECT ps.* INTO v_paket
      FROM paket_satis ps
      JOIN paket p ON p.id = ps.paket_id
      WHERE ps.hasta_id = v_randevu.hasta_id
        AND ps.klinik_id = v_randevu.klinik_id
        AND p.islem_tanimi_id = v_randevu.islem_tanimi_id
        AND ps.durum = 'aktif'
        AND ps.kalan_adet > 0
      ORDER BY ps.satis_tarihi ASC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE paket_satis
        SET kalan_adet = kalan_adet - 1,
            durum = CASE WHEN kalan_adet - 1 <= 0 THEN 'bitti' ELSE durum END,
            updated_at = now()
        WHERE id = v_paket.id;
        v_dusuldu := true;
      ELSE
        -- Paket yok: normal seans gibi bedeli bakiyeye borç olarak işle
        -- (randevu_seans_bedelini_isle ile aynı fiyat/iskonto hesabı; mükerrer yazılmaz).
        IF NOT EXISTS (SELECT 1 FROM hasta_bakiye_hareket WHERE randevu_id = p_randevu_id AND tur = 'borc') THEN
          SELECT * INTO v_islem FROM islem_tanimi WHERE id = v_randevu.islem_tanimi_id;
          v_fiyat := islem_tanimi_etkin_fiyat(v_islem.id, v_randevu.hasta_id);
          v_iskonto := LEAST(GREATEST(COALESCE(v_randevu.planlanan_iskonto_tutari, 0), 0), v_fiyat);

          INSERT INTO hasta_bakiye_hareket (
            klinik_id, hasta_id, tur, tutar, iskonto_tutari, iskonto_uygulayan_kullanici_id, randevu_id, aciklama
          )
          VALUES (
            v_randevu.klinik_id, v_randevu.hasta_id, 'borc', v_fiyat, v_iskonto,
            CASE WHEN v_iskonto > 0 THEN v_randevu.olusturan_kullanici_id ELSE NULL END,
            p_randevu_id,
            'Seans ücreti (geç iptal): ' || v_islem.ad
          );
          v_borc := true;
        END IF;
      END IF;
    END IF;
  ELSIF v_randevu.paket_satis_id IS NOT NULL THEN
    -- Bedelsiz iptal: check-in'de düşülmüş hak hastaya iade edilir.
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
    v_iade := true;
  END IF;

  UPDATE randevu
  SET durum = 'iptal',
      iptal_aciklamasi = v_aciklama,
      iptal_tarihi = now(),
      iptal_eden_kullanici_id = app_kullanici_id(),
      gec_iptal = v_gec,
      bedelli_iptal = COALESCE(p_bedelli, false),
      iptal_paket_dusuldu = v_dusuldu,
      iptal_borc_yazildi = v_borc,
      paket_satis_id = CASE WHEN v_dusuldu THEN v_paket.id WHEN v_iade THEN NULL ELSE paket_satis_id END
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'bedelli', COALESCE(p_bedelli, false),
    'paket_dusuldu', v_dusuldu, 'borc_yazildi', v_borc, 'paket_iade', v_iade);
END;
$function$
;

CREATE FUNCTION public.hasta_bakiye_hareket_kredi_karti_ayari()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_klinik_id uuid := NEW.klinik_id;
  v_hesap uuid;
  v_oran numeric;
BEGIN
  IF NEW.tur <> 'odeme' OR NEW.odeme_yontemi IS DISTINCT FROM 'kredi_karti' THEN
    RETURN NEW;
  END IF;

  IF v_klinik_id IS NULL THEN
    SELECT h.klinik_id INTO v_klinik_id FROM hasta h WHERE h.id = NEW.hasta_id;
  END IF;

  SELECT k.kredi_karti_tahsilat_banka_hesap_id, k.kredi_karti_komisyon_orani
    INTO v_hesap, v_oran
    FROM klinik k WHERE k.id = v_klinik_id;

  IF v_hesap IS NOT NULL THEN
    NEW.banka_hesap_id := v_hesap;
    NEW.komisyon_orani := coalesce(v_oran, 0);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.tedarikci_anahtari(p_ad text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select lower(translate(btrim(regexp_replace(coalesce(p_ad, ''), '\s+', ' ', 'g')), 'İI', 'iı'))
$function$
;

CREATE FUNCTION public.klinik_cari_bakiyeler(p_klinik_id uuid, p_anahtar text DEFAULT NULL::text)
 RETURNS TABLE(anahtar text, borc numeric, odenen numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select k.anahtar, sum(k.borc)::numeric, sum(k.odenen)::numeric
    from (
      -- "Cariye Ekle": yalnız borç
      select tedarikci_anahtari(h.tedarikci_adi) as anahtar, h.tutar::numeric as borc, 0::numeric as odenen
        from klinik_harcama h
       where h.klinik_id = p_klinik_id and h.odeme_tipi = 'cari'
      union all
      -- Ödenmiş gider: borç ve ödenen birlikte (bakiyeyi etkilemez, ekstrede görünür)
      select tedarikci_anahtari(h.tedarikci_adi), h.tutar::numeric, h.tutar::numeric
        from klinik_harcama h
       where h.klinik_id = p_klinik_id and h.odeme_tipi in ('nakit', 'havale', 'kredi_karti')
      union all
      select tedarikci_anahtari(o.tedarikci_adi), 0::numeric, o.tutar::numeric
        from klinik_cari_odeme o
       where o.klinik_id = p_klinik_id
    ) k
   where k.anahtar <> '' and (p_anahtar is null or k.anahtar = p_anahtar)
   group by k.anahtar
$function$
;

CREATE FUNCTION public.klinik_cari_odeme_ekle(p_tedarikci_adi text, p_tutar numeric, p_tarih date, p_odeme_tipi text, p_banka_hesap_id uuid DEFAULT NULL::uuid, p_kredi_karti_id uuid DEFAULT NULL::uuid, p_aciklama text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik uuid := current_klinik_id();
  v_anahtar text := tedarikci_anahtari(p_tedarikci_adi);
  v_borc numeric := 0;
  v_odenen numeric := 0;
  v_id uuid;
begin
  if v_klinik is null or current_rol() is distinct from 'klinik_admin' then
    raise exception 'yetkisiz';
  end if;
  if v_anahtar = '' then
    raise exception 'tedarikci_gerekli';
  end if;
  if p_tutar is null or p_tutar <= 0 then
    raise exception 'tutar_gecersiz';
  end if;
  if p_tarih is null then
    raise exception 'tarih_gerekli';
  end if;
  if p_odeme_tipi not in ('nakit', 'havale', 'kredi_karti') then
    raise exception 'odeme_tipi_gecersiz';
  end if;
  if p_odeme_tipi = 'havale' then
    if p_banka_hesap_id is null
       or not exists (select 1 from klinik_banka_hesaplari b where b.id = p_banka_hesap_id and b.klinik_id = v_klinik) then
      raise exception 'banka_hesabi_gerekli';
    end if;
  end if;
  if p_odeme_tipi = 'kredi_karti' and p_kredi_karti_id is not null
     and not exists (select 1 from klinik_kredi_kartlari c where c.id = p_kredi_karti_id and c.klinik_id = v_klinik) then
    raise exception 'kart_bulunamadi';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_klinik::text || ':' || v_anahtar, 0));

  select b.borc, b.odenen into v_borc, v_odenen from klinik_cari_bakiyeler(v_klinik, v_anahtar) b;
  if coalesce(v_borc, 0) - coalesce(v_odenen, 0) < p_tutar - 0.005 then
    raise exception 'bakiye_asildi';
  end if;

  insert into klinik_cari_odeme (
    klinik_id, tedarikci_adi, tutar, tarih, odeme_tipi, banka_hesap_id, kredi_karti_id, aciklama, olusturan_kullanici_id
  ) values (
    v_klinik, btrim(p_tedarikci_adi), p_tutar, p_tarih, p_odeme_tipi,
    case when p_odeme_tipi = 'havale' then p_banka_hesap_id end,
    case when p_odeme_tipi = 'kredi_karti' then p_kredi_karti_id end,
    nullif(btrim(coalesce(p_aciklama, '')), ''),
    app_kullanici_id()
  ) returning id into v_id;

  return v_id;
end;
$function$
;

CREATE FUNCTION public.klinik_harcama_cari_butunluk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_anahtar text;
  v_borc numeric;
  v_odenen numeric;
  v_yeni numeric := 0;
begin
  if app_kullanici_id() is null or old.odeme_tipi is distinct from 'cari' then
    return coalesce(new, old);
  end if;

  v_anahtar := tedarikci_anahtari(old.tedarikci_adi);
  if tg_op = 'UPDATE' and new.odeme_tipi = 'cari' and tedarikci_anahtari(new.tedarikci_adi) = v_anahtar then
    v_yeni := new.tutar;
  end if;
  -- Borç artıyor/aynı kalıyorsa bakiye düşmez; kontrol gereksiz.
  if v_yeni >= old.tutar then
    return coalesce(new, old);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.klinik_id::text || ':' || v_anahtar, 0));

  select b.borc, b.odenen into v_borc, v_odenen from klinik_cari_bakiyeler(old.klinik_id, v_anahtar) b;
  if coalesce(v_borc, 0) - coalesce(v_odenen, 0) - old.tutar + v_yeni < -0.005 then
    raise exception 'cari_bakiye_negatif';
  end if;

  return coalesce(new, old);
end;
$function$
;

CREATE FUNCTION public.kredi_karti_borc_ozetleri(p_klinik_id uuid)
 RETURNS TABLE(kredi_karti_id uuid, harcama numeric, odeme numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select k.kredi_karti_id,
         coalesce(sum(k.tutar) filter (where k.tip = 'harcama'), 0)::numeric,
         coalesce(sum(k.tutar) filter (where k.tip = 'odeme'), 0)::numeric
    from klinik_kredi_karti_hareketleri k
   where k.klinik_id = p_klinik_id
   group by k.kredi_karti_id
$function$
;

CREATE FUNCTION public.banka_hesabi_butunluk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_yeni jsonb := to_jsonb(NEW);
  v_eski jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_yontem text := v_yeni ->> TG_ARGV[0];
  v_hesap uuid := (v_yeni ->> TG_ARGV[2])::uuid;
BEGIN
  IF v_hesap IS NOT NULL
     AND (TG_OP = 'INSERT' OR v_hesap IS DISTINCT FROM (v_eski ->> TG_ARGV[2])::uuid) THEN
    IF NOT EXISTS (
      SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = v_hesap AND b.klinik_id = NEW.klinik_id
    ) THEN
      RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_yontem = TG_ARGV[1] AND v_hesap IS NULL
     AND (TG_OP = 'INSERT' OR v_yontem IS DISTINCT FROM v_eski ->> TG_ARGV[0]) THEN
    RAISE EXCEPTION 'banka_hesabi_gerekli' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.banka_hesabi_silme_engeli()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM hasta_bakiye_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_harcama WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM personel_hesap_hareket WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_cari_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM klinik_kredi_karti_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (SELECT 1 FROM kamusal_odeme WHERE banka_hesap_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM nakit_banka_hareketi
       WHERE kaynak_banka_hesap_id = OLD.id OR hedef_banka_hesap_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'banka_hesabi_kullaniliyor' USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN OLD;
END;
$function$
;

CREATE FUNCTION public.resmi_tatil_onerisi_karar(p_yil integer, p_bayram text, p_onay boolean, p_tarihler date[] DEFAULT NULL::date[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_klinik_id uuid := current_klinik_id();
  v_oneri_tarihleri date[];
  v_tarihler date[];
  v_adet integer;
  v_bayram_adi text;
  v_eklenen integer := 0;
  i integer;
begin
  if current_rol() is distinct from 'klinik_admin' or v_klinik_id is null then
    raise exception 'yetkisiz';
  end if;
  if p_bayram not in ('ramazan', 'kurban') then
    raise exception 'bayram_gecersiz';
  end if;

  select array_agg(o.tarih order by o.tarih) into v_oneri_tarihleri
  from (
    select tarih from resmi_tatil_oneri
    where klinik_id = v_klinik_id and yil = p_yil and bayram = p_bayram and durum = 'bekliyor'
    for update
  ) o;

  v_adet := coalesce(array_length(v_oneri_tarihleri, 1), 0);
  if v_adet = 0 then
    raise exception 'oneri_bulunamadi';
  end if;

  if p_onay then
    v_tarihler := coalesce(p_tarihler, v_oneri_tarihleri);
    select array_agg(t order by t) into v_tarihler from (select distinct unnest(v_tarihler) as t) d;

    if coalesce(array_length(v_tarihler, 1), 0) <> v_adet
       or v_tarihler[v_adet] - v_tarihler[1] <> v_adet - 1 then
      raise exception 'tarihler_gecersiz';
    end if;
    if extract(year from v_tarihler[1]) <> p_yil or extract(year from v_tarihler[v_adet]) <> p_yil then
      raise exception 'tarihler_gecersiz';
    end if;

    v_bayram_adi := case p_bayram when 'ramazan' then 'Ramazan Bayramı' else 'Kurban Bayramı' end;
    for i in 1 .. v_adet loop
      if not exists (
        select 1 from resmi_tatil r
        where r.tarih = v_tarihler[i] and (r.klinik_id is null or r.klinik_id = v_klinik_id)
      ) then
        insert into resmi_tatil (klinik_id, tarih, ad)
        values (v_klinik_id, v_tarihler[i], format('%s (%s. gün)', v_bayram_adi, i));
        v_eklenen := v_eklenen + 1;
      end if;
    end loop;
  end if;

  update resmi_tatil_oneri
  set durum = case when p_onay then 'onaylandi' else 'reddedildi' end,
      karar_veren_id = app_kullanici_id(),
      karar_tarihi = now()
  where klinik_id = v_klinik_id and yil = p_yil and bayram = p_bayram and durum = 'bekliyor';

  return v_eklenen;
end;
$function$
;

CREATE FUNCTION public.turkce_kucuk_harf(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select translate(
    coalesce(p, ''),
    'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZÂÎÛâîû',
    'abcçdefgğhıijklmnoöpqrsştuüvwxyzaiuaiu'
  );
$function$
;

CREATE FUNCTION public.turkce_sira_anahtari(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select translate(
    public.turkce_kucuk_harf(btrim(p)),
    'abcçdefgğhıijklmnoöpqrsştuüvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'
  );
$function$
;

CREATE FUNCTION public.hasta_bas_harf_sayilari()
 RETURNS TABLE(harf text, adet bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) as harf, count(*) as adet
  from hasta h
  group by 1;
$function$
;

CREATE FUNCTION public.hasta_harf_listesi(p_harf text, p_bas integer DEFAULT 0, p_adet integer DEFAULT 50)
 RETURNS SETOF hasta
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select h.*
  from hasta h
  where p_harf is null
     or (p_harf = 'diger'
         and position(left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) in 'abcçdefgğhıijklmnoöprsştuüvyz') = 0)
     or (p_harf <> 'diger' and left(turkce_kucuk_harf(btrim(h.ad_soyad)), 1) = p_harf)
  order by turkce_sira_anahtari(h.ad_soyad) collate "C", h.id
  offset greatest(coalesce(p_bas, 0), 0)
  limit least(greatest(coalesce(p_adet, 50), 1), 200);
$function$
;

CREATE FUNCTION public.randevu_gelmedi_isaretle(p_randevu_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_randevu randevu%ROWTYPE;
  v_yetkili boolean;
  v_iade boolean := false;
BEGIN
  SELECT * INTO v_randevu FROM randevu WHERE id = p_randevu_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'randevu_bulunamadi';
  END IF;

  IF NOT (v_randevu.klinik_id = current_klinik_id() OR is_super_admin()) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  v_yetkili := current_rol() IN ('klinik_admin', 'resepsiyon') OR is_super_admin() OR (
    current_rol() = 'terapist' AND EXISTS (
      SELECT 1 FROM terapist t
      JOIN personel p ON p.id = t.personel_id
      WHERE t.id = v_randevu.terapist_id AND p.kullanici_id = app_kullanici_id()
    )
  );
  IF NOT COALESCE(v_yetkili, false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  IF v_randevu.durum IN ('iptal', 'tamamlandi') THEN
    RAISE EXCEPTION 'randevu_kapali';
  END IF;

  -- Check-in'de düşülen paket hakkı iade edilir (gelmeyen hastanın seansı düşülmez).
  IF v_randevu.paket_satis_id IS NOT NULL THEN
    UPDATE paket_satis
    SET kalan_adet = kalan_adet + 1,
        durum = CASE WHEN durum = 'bitti' THEN 'aktif' ELSE durum END,
        updated_at = now()
    WHERE id = v_randevu.paket_satis_id;
    v_iade := true;
  END IF;

  UPDATE randevu
  SET durum = 'gelmedi', gecikme_dakika = NULL, paket_satis_id = NULL
  WHERE id = p_randevu_id;

  RETURN jsonb_build_object('hasta_id', v_randevu.hasta_id, 'paket_iade', v_iade);
END;
$function$
;

CREATE FUNCTION public.nakit_banka_hareketi_hesap_butunluk()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kaynak_banka_hesap_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = NEW.kaynak_banka_hesap_id AND b.klinik_id = NEW.klinik_id
  ) THEN
    RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hedef_banka_hesap_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM klinik_banka_hesaplari b WHERE b.id = NEW.hedef_banka_hesap_id AND b.klinik_id = NEW.klinik_id
  ) THEN
    RAISE EXCEPTION 'banka_hesabi_gecersiz' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.hasta_portal_alan_kisitla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_izinli text[] := ARRAY[
    'cinsiyet', 'eposta', 'referans_kanali',
    'ticari_ileti_onay_tarihi', 'ticari_ileti_onaylayan_tip', 'ticari_ileti_onaylayan_kullanici_id',
    'ozel_nitelikli_veri_onay_tarihi', 'ozel_nitelikli_onaylayan_tip', 'ozel_nitelikli_onaylayan_kullanici_id',
    'son_guncelleyen_tip', 'son_guncelleyen_kullanici_id', 'updated_at'
  ];
  v_eski jsonb := to_jsonb(OLD);
  v_yeni jsonb := to_jsonb(NEW);
  v_kolon text;
BEGIN
  -- Yalnız hasta portalı oturumu (personel rolü yok, hasta eşlemesi var). Personel, servis rolü
  -- ve oturumsuz bağlam etkilenmez.
  IF current_rol() IS NOT NULL OR current_hasta_id() IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_kolon IN SELECT jsonb_object_keys(v_yeni) LOOP
    IF v_yeni -> v_kolon IS DISTINCT FROM v_eski -> v_kolon AND NOT (v_kolon = ANY (v_izinli)) THEN
      RAISE EXCEPTION 'portal_alan_degistirilemez: %', v_kolon USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$
;

CREATE FUNCTION public.personel_hesap_hareket_tutar_yuvarla()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.tutar := round(NEW.tutar, 2);
  RETURN NEW;
END;
$function$
;


-- ===== Kısıtlar =====
ALTER TABLE klinik ADD CONSTRAINT klinik_pkey PRIMARY KEY (id);
ALTER TABLE kullanici ADD CONSTRAINT kullanici_pkey PRIMARY KEY (id);
ALTER TABLE personel ADD CONSTRAINT personel_pkey PRIMARY KEY (id);
ALTER TABLE terapist ADD CONSTRAINT terapist_pkey PRIMARY KEY (id);
ALTER TABLE hasta ADD CONSTRAINT hasta_pkey PRIMARY KEY (id);
ALTER TABLE oda ADD CONSTRAINT oda_pkey PRIMARY KEY (id);
ALTER TABLE cihaz ADD CONSTRAINT cihaz_pkey PRIMARY KEY (id);
ALTER TABLE randevu ADD CONSTRAINT randevu_pkey PRIMARY KEY (id);
ALTER TABLE klinik_ayarlar ADD CONSTRAINT klinik_ayarlar_pkey PRIMARY KEY (klinik_id);
ALTER TABLE islem_kategori ADD CONSTRAINT islem_kategori_pkey PRIMARY KEY (id);
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_pkey PRIMARY KEY (id);
ALTER TABLE paket ADD CONSTRAINT paket_pkey PRIMARY KEY (id);
ALTER TABLE odeme ADD CONSTRAINT odeme_pkey PRIMARY KEY (id);
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_pkey PRIMARY KEY (id);
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_pkey PRIMARY KEY (id);
ALTER TABLE odeme_satiri ADD CONSTRAINT odeme_satiri_pkey PRIMARY KEY (id);
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_pkey PRIMARY KEY (id);
ALTER TABLE fatura ADD CONSTRAINT fatura_pkey PRIMARY KEY (id);
ALTER TABLE hasta_kullanici ADD CONSTRAINT hasta_kullanici_pkey PRIMARY KEY (id);
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_pkey PRIMARY KEY (id);
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_pkey PRIMARY KEY (hasta_id);
ALTER TABLE klinik_muhasebe_entegrasyonu ADD CONSTRAINT klinik_muhasebe_entegrasyonu_pkey PRIMARY KEY (klinik_id);
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_pkey PRIMARY KEY (id);
ALTER TABLE islem_kontrendikasyon ADD CONSTRAINT islem_kontrendikasyon_pkey PRIMARY KEY (id);
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_pkey PRIMARY KEY (id);
ALTER TABLE olcek_tanimi ADD CONSTRAINT olcek_tanimi_pkey PRIMARY KEY (id);
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_pkey PRIMARY KEY (id);
ALTER TABLE egzersiz_kutuphanesi ADD CONSTRAINT egzersiz_kutuphanesi_pkey PRIMARY KEY (id);
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_pkey PRIMARY KEY (id);
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_pkey PRIMARY KEY (id);
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_pkey PRIMARY KEY (id);
ALTER TABLE seans_checklist_sablonu ADD CONSTRAINT seans_checklist_sablonu_pkey PRIMARY KEY (id);
ALTER TABLE randevu_checklist ADD CONSTRAINT randevu_checklist_pkey PRIMARY KEY (id);
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_pkey PRIMARY KEY (id);
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_pkey PRIMARY KEY (id);
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_pkey PRIMARY KEY (id);
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_pkey PRIMARY KEY (id);
ALTER TABLE hasta_sigorta ADD CONSTRAINT hasta_sigorta_pkey PRIMARY KEY (id);
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_pkey PRIMARY KEY (id);
ALTER TABLE hasta_onam ADD CONSTRAINT hasta_onam_pkey PRIMARY KEY (id);
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_pkey PRIMARY KEY (id);
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_pkey PRIMARY KEY (id);
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_pkey PRIMARY KEY (id);
ALTER TABLE personel_hassas ADD CONSTRAINT personel_hassas_pkey PRIMARY KEY (personel_id);
ALTER TABLE personel_acil_kisi ADD CONSTRAINT personel_acil_kisi_pkey PRIMARY KEY (id);
ALTER TABLE personel_mesleki_belge ADD CONSTRAINT personel_mesleki_belge_pkey PRIMARY KEY (personel_id);
ALTER TABLE tedavi_protokolu ADD CONSTRAINT tedavi_protokolu_pkey PRIMARY KEY (id);
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_pkey PRIMARY KEY (id);
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_pkey PRIMARY KEY (id);
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_pkey PRIMARY KEY (id);
ALTER TABLE islem_tanimi_fiyat_gecmisi ADD CONSTRAINT islem_tanimi_fiyat_gecmisi_pkey PRIMARY KEY (id);
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_pkey PRIMARY KEY (klinik_id);
ALTER TABLE vardiya_turu ADD CONSTRAINT vardiya_turu_pkey PRIMARY KEY (id);
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_pkey PRIMARY KEY (id);
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_pkey PRIMARY KEY (id);
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_pkey PRIMARY KEY (id);
ALTER TABLE personel_ucret ADD CONSTRAINT personel_ucret_pkey PRIMARY KEY (id);
ALTER TABLE klinik_arac ADD CONSTRAINT klinik_arac_pkey PRIMARY KEY (id);
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_pkey PRIMARY KEY (id);
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_pkey PRIMARY KEY (id);
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_pkey PRIMARY KEY (id);
ALTER TABLE destek_talebi ADD CONSTRAINT destek_talebi_pkey PRIMARY KEY (id);
ALTER TABLE mesaj_kurallari ADD CONSTRAINT mesaj_kurallari_pkey PRIMARY KEY (id);
ALTER TABLE mesaj_kuyrugu ADD CONSTRAINT mesaj_kuyrugu_pkey PRIMARY KEY (id);
ALTER TABLE mesaj_kredileri ADD CONSTRAINT mesaj_kredileri_pkey PRIMARY KEY (id);
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_pkey PRIMARY KEY (id);
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_pkey PRIMARY KEY (id);
ALTER TABLE resmi_tatil ADD CONSTRAINT resmi_tatil_pkey PRIMARY KEY (id);
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_pkey PRIMARY KEY (id);
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_pkey PRIMARY KEY (id);
ALTER TABLE pozisyon_sablonlari ADD CONSTRAINT pozisyon_sablonlari_pkey PRIMARY KEY (id);
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_pkey PRIMARY KEY (id);
ALTER TABLE klinik_banka_hesaplari ADD CONSTRAINT klinik_banka_hesaplari_pkey PRIMARY KEY (id);
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_pkey PRIMARY KEY (id);
ALTER TABLE personel_egitim ADD CONSTRAINT personel_egitim_pkey PRIMARY KEY (id);
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_pkey PRIMARY KEY (id);
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_pkey PRIMARY KEY (id);
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_pkey PRIMARY KEY (id);
ALTER TABLE hiz_siniri_sayac ADD CONSTRAINT hiz_siniri_sayac_pkey PRIMARY KEY (anahtar, pencere_baslangic);
ALTER TABLE audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id, created_at);
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_pkey PRIMARY KEY (id);
ALTER TABLE kasa_dengeleme ADD CONSTRAINT kasa_dengeleme_pkey PRIMARY KEY (id);
ALTER TABLE klinik_kredi_kartlari ADD CONSTRAINT klinik_kredi_kartlari_pkey PRIMARY KEY (id);
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_pkey PRIMARY KEY (id);
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_pkey PRIMARY KEY (id);
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_pkey PRIMARY KEY (id);
ALTER TABLE klinik ADD CONSTRAINT klinik_subdomain_key UNIQUE (subdomain);
ALTER TABLE terapist ADD CONSTRAINT terapist_personel_id_key UNIQUE (personel_id);
ALTER TABLE islem_kategori ADD CONSTRAINT islem_kategori_klinik_id_ad_key UNIQUE (klinik_id, ad);
ALTER TABLE hasta_kullanici ADD CONSTRAINT hasta_kullanici_hasta_id_key UNIQUE (hasta_id);
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_randevu_id_key UNIQUE (randevu_id);
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_kalem_id_tarih_key UNIQUE (kalem_id, tarih);
ALTER TABLE randevu_checklist ADD CONSTRAINT randevu_checklist_randevu_id_sablon_id_key UNIQUE (randevu_id, sablon_id);
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_randevu_id_key UNIQUE (randevu_id);
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_hasta_id_iliskili_hasta_id_key UNIQUE (hasta_id, iliskili_hasta_id);
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_tedavi_protokolu_id_sira_key UNIQUE (tedavi_protokolu_id, sira);
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_personel_id_yil_ay_key UNIQUE (personel_id, yil, ay);
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_personel_id_tarih_key UNIQUE (personel_id, tarih);
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_randevu_id_key UNIQUE (randevu_id);
ALTER TABLE mesaj_kurallari ADD CONSTRAINT mesaj_kurallari_klinik_id_tetikleyici_kodu_key UNIQUE (klinik_id, tetikleyici_kodu);
ALTER TABLE mesaj_kuyrugu ADD CONSTRAINT mesaj_kuyrugu_idempotency_anahtari_key UNIQUE (idempotency_anahtari);
ALTER TABLE mesaj_kredileri ADD CONSTRAINT mesaj_kredileri_klinik_id_kanal_key UNIQUE (klinik_id, kanal);
ALTER TABLE resmi_tatil ADD CONSTRAINT resmi_tatil_klinik_id_tarih_key UNIQUE (klinik_id, tarih);
ALTER TABLE pozisyon_sablonlari ADD CONSTRAINT pozisyon_sablonlari_ad_key UNIQUE (ad);
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_klinik_id_ad_key UNIQUE (klinik_id, ad);
ALTER TABLE klinik ADD CONSTRAINT klinik_qr_kisa_kod_key UNIQUE (qr_kisa_kod);
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_klinik_id_ad_key UNIQUE (klinik_id, ad);
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_sira_tekil UNIQUE (islem_tanimi_id, sira) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_klinik_id_bayram_tarih_key UNIQUE (klinik_id, bayram, tarih);
ALTER TABLE klinik ADD CONSTRAINT klinik_plan_turu_check CHECK ((plan_turu = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text])));
ALTER TABLE kullanici ADD CONSTRAINT kullanici_klinik_gerekli CHECK (((rol = 'super_admin'::kullanici_rol_tipi) OR (klinik_id IS NOT NULL)));
ALTER TABLE terapist ADD CONSTRAINT terapist_maas_hesaplama_modeli_check CHECK ((maas_hesaplama_modeli = ANY (ARRAY['sabit'::text, 'islem_basi_prim'::text, 'barajli_prim'::text])));
ALTER TABLE randevu ADD CONSTRAINT randevu_check CHECK ((bitis > baslangic));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_kdv_orani_check CHECK (((kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)));
ALTER TABLE paket ADD CONSTRAINT paket_seans_sayisi_check CHECK ((seans_sayisi > 0));
ALTER TABLE paket ADD CONSTRAINT paket_fiyat_check CHECK ((fiyat >= (0)::numeric));
ALTER TABLE paket ADD CONSTRAINT paket_kdv_orani_check CHECK (((kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)));
ALTER TABLE odeme ADD CONSTRAINT odeme_iskonto_tutari_check CHECK ((iskonto_tutari >= (0)::numeric));
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_kalan_adet_check CHECK ((kalan_adet >= 0));
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'dondu'::text, 'bitti'::text, 'iptal'::text])));
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_miktar_check CHECK ((miktar > 0));
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_birim_fiyat_check CHECK ((birim_fiyat >= (0)::numeric));
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_kdv_orani_check CHECK (((kdv_orani >= (0)::numeric) AND (kdv_orani <= (100)::numeric)));
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_check CHECK (((islem_tanimi_id IS NULL) OR (paket_satis_id IS NULL)));
ALTER TABLE odeme_satiri ADD CONSTRAINT odeme_satiri_yontem_check CHECK ((yontem = ANY (ARRAY['kredi_karti'::text, 'banka_havalesi'::text, 'nakit'::text])));
ALTER TABLE odeme_satiri ADD CONSTRAINT odeme_satiri_tutar_check CHECK ((tutar > (0)::numeric));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_tur_check CHECK ((tur = ANY (ARRAY['odeme'::text, 'iade'::text, 'kredi'::text, 'borc'::text])));
ALTER TABLE fatura ADD CONSTRAINT fatura_durum_check CHECK ((durum = ANY (ARRAY['bekliyor'::text, 'kesildi'::text, 'hata'::text])));
ALTER TABLE terapist ADD CONSTRAINT terapist_prim_sabit_tutar_check CHECK ((prim_sabit_tutar >= (0)::numeric));
ALTER TABLE terapist ADD CONSTRAINT terapist_baraj_seans_sayisi_check CHECK ((baraj_seans_sayisi > 0));
ALTER TABLE terapist ADD CONSTRAINT terapist_baraj_bonus_tutari_check CHECK ((baraj_bonus_tutari >= (0)::numeric));
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_durum_check CHECK ((durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_cinsiyet_check CHECK ((cinsiyet = ANY (ARRAY['kadin'::text, 'erkek'::text, 'belirtilmemis'::text])));
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_kimlik_no_tipi_check CHECK ((kimlik_no_tipi = ANY (ARRAY['tc'::text, 'pasaport'::text])));
ALTER TABLE klinik_muhasebe_entegrasyonu ADD CONSTRAINT klinik_muhasebe_entegrasyonu_baglanti_durumu_check CHECK ((baglanti_durumu = ANY (ARRAY['bekliyor'::text, 'baglandi'::text])));
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_oncelik_durumu_check CHECK ((oncelik_durumu = ANY (ARRAY['normal'::text, 'oncelikli'::text, 'acil'::text])));
ALTER TABLE cihaz ADD CONSTRAINT cihaz_adet_check CHECK ((adet >= 1));
ALTER TABLE oda ADD CONSTRAINT oda_kapasite_check CHECK ((kapasite >= 1));
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_haftanin_gunu_check CHECK (((haftanin_gunu >= 0) AND (haftanin_gunu <= 6)));
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_sure_dakika_check CHECK (((sure_dakika >= 5) AND (sure_dakika <= 480)));
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'iptal'::text])));
ALTER TABLE islem_kontrendikasyon ADD CONSTRAINT islem_kontrendikasyon_risk_tipi_check CHECK ((risk_tipi = ANY (ARRAY['alerji'::text, 'kalp_pili'::text, 'kan_sulandirici'::text, 'dusme_riski'::text, 'hamilelik'::text, 'diyabet'::text, 'epilepsi'::text, 'metal_implant'::text, 'diger'::text])));
ALTER TABLE islem_kontrendikasyon ADD CONSTRAINT islem_kontrendikasyon_uyari_seviyesi_check CHECK ((uyari_seviyesi = ANY (ARRAY['blok'::text, 'uyari'::text])));
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_hedef_tipi_check CHECK ((hedef_tipi = ANY (ARRAY['vas'::text, 'rom'::text, 'fonksiyonel'::text, 'serbest'::text])));
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'ulasildi'::text, 'basarisiz'::text, 'iptal'::text])));
ALTER TABLE olcek_tanimi ADD CONSTRAINT olcek_tanimi_yorum_yonu_check CHECK ((yorum_yonu = ANY (ARRAY['yuksek_iyi'::text, 'dusuk_iyi'::text])));
ALTER TABLE egzersiz_kutuphanesi ADD CONSTRAINT egzersiz_kutuphanesi_varsayilan_set_check CHECK ((varsayilan_set > 0));
ALTER TABLE egzersiz_kutuphanesi ADD CONSTRAINT egzersiz_kutuphanesi_varsayilan_tekrar_check CHECK ((varsayilan_tekrar > 0));
ALTER TABLE egzersiz_kutuphanesi ADD CONSTRAINT egzersiz_kutuphanesi_varsayilan_sure_sn_check CHECK ((varsayilan_sure_sn > 0));
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'tamamlandi'::text, 'iptal'::text])));
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_check CHECK (((bitis_tarihi IS NULL) OR (bitis_tarihi >= baslangic_tarihi)));
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_set_check CHECK ((set > 0));
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_tekrar_check CHECK ((tekrar > 0));
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_sure_sn_check CHECK ((sure_sn > 0));
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_agri_skoru_check CHECK (((agri_skoru >= 0) AND (agri_skoru <= 10)));
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_kanal_check CHECK ((kanal = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'telefon'::text, 'portal'::text])));
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_yon_check CHECK ((yon = ANY (ARRAY['giden'::text, 'gelen'::text])));
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_anket_tipi_check CHECK ((anket_tipi = ANY (ARRAY['nps'::text, 'memnuniyet'::text])));
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_tetikleyici_check CHECK ((tetikleyici = ANY (ARRAY['paket_bitis'::text, 'seans_sayisi'::text])));
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_puan_check CHECK ((puan >= 0));
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_agri_skoru_check CHECK (((agri_skoru >= 0) AND (agri_skoru <= 10)));
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_iliski_turu_check CHECK ((iliski_turu = ANY (ARRAY['ebeveyn'::text, 'cocuk'::text, 'es'::text, 'kardes'::text, 'diger'::text])));
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_check CHECK ((hasta_id <> iliskili_hasta_id));
ALTER TABLE hasta_sigorta ADD CONSTRAINT hasta_sigorta_katilim_payi_orani_check CHECK (((katilim_payi_orani >= (0)::numeric) AND (katilim_payi_orani <= (100)::numeric)));
ALTER TABLE hasta_sigorta ADD CONSTRAINT hasta_sigorta_check CHECK (((gecerlilik_bitis IS NULL) OR (gecerlilik_baslangic IS NULL) OR (gecerlilik_bitis >= gecerlilik_baslangic)));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_versiyon_no_check CHECK ((versiyon_no > 0));
ALTER TABLE hasta_onam ADD CONSTRAINT hasta_onam_imzalayan_check CHECK ((imzalayan = ANY (ARRAY['hasta'::text, 'veli'::text])));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_kategori_check CHECK ((kategori = ANY (ARRAY['radyoloji'::text, 'klinik_foto'::text, 'dokuman'::text])));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_kategori_turu_check CHECK ((((kategori = 'radyoloji'::text) AND (belge_turu = ANY (ARRAY['rontgen'::text, 'mr'::text, 'tomografi'::text, 'ultrason'::text]))) OR ((kategori = 'klinik_foto'::text) AND (belge_turu = ANY (ARRAY['postur_on'::text, 'postur_yan'::text, 'postur_arka'::text, 'bolgesel'::text]))) OR ((kategori = 'dokuman'::text) AND (belge_turu = ANY (ARRAY['recete'::text, 'sevk'::text, 'epikriz'::text, 'diger'::text])))));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_asama_check CHECK (((asama IS NULL) OR (asama = ANY (ARRAY['tedavi_oncesi'::text, 'ara_kontrol'::text, 'tedavi_sonrasi'::text]))));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_klinik_foto_onam_check CHECK (((kategori <> 'klinik_foto'::text) OR (onam_id IS NOT NULL)));
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_dosya_boyut_check CHECK (((dosya_boyut_byte IS NULL) OR (dosya_boyut_byte >= 0)));
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_x_check CHECK (((x >= (0)::numeric) AND (x <= (1)::numeric)));
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_y_check CHECK (((y >= (0)::numeric) AND (y <= (1)::numeric)));
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_severity_check CHECK (((severity >= 0) AND (severity <= 10)));
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'tamamlandi'::text, 'iptal'::text])));
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_tutar_check CHECK ((tutar >= (0)::numeric));
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_yuz_check CHECK ((yuz = ANY (ARRAY['on'::text, 'arka'::text])));
ALTER TABLE personel ADD CONSTRAINT personel_cinsiyet_check CHECK ((cinsiyet = ANY (ARRAY['erkek'::text, 'kadin'::text, 'belirtilmemis'::text])));
ALTER TABLE personel ADD CONSTRAINT personel_calisma_tipi_check CHECK ((calisma_tipi = ANY (ARRAY['tam_zamanli'::text, 'yari_zamanli'::text, 'vardiyali'::text, 'prim_usulu'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_kvkk_onaylayan_tip_check CHECK ((kvkk_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_ozel_nitelikli_onaylayan_tip_check CHECK ((ozel_nitelikli_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_ticari_ileti_onaylayan_tip_check CHECK ((ticari_ileti_onaylayan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_olusturan_tip_check CHECK ((olusturan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_son_guncelleyen_tip_check CHECK ((son_guncelleyen_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE randevu ADD CONSTRAINT randevu_gecikme_dakika_check CHECK (((gecikme_dakika IS NULL) OR (gecikme_dakika > 0)));
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_sira_check CHECK ((sira > 0));
ALTER TABLE randevu ADD CONSTRAINT randevu_kaynak_check CHECK ((kaynak = ANY (ARRAY['uygulama'::text, 'arsiv'::text])));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_kaynak_check CHECK ((kaynak = ANY (ARRAY['uygulama'::text, 'arsiv'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_kayit_kanali_check CHECK ((kayit_kanali = ANY (ARRAY['resepsiyon'::text, 'qr_self_servis'::text])));
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_puan_check CHECK (((puan >= 1) AND (puan <= 5)));
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_bos_olamaz CHECK (((puan IS NOT NULL) OR (oneri_metni IS NOT NULL)));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_vita_fiyat_check CHECK ((vita_fiyat >= (0)::numeric));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_plus_fiyat_check CHECK (((plus_fiyat IS NULL) OR (plus_fiyat >= (0)::numeric)));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_elit_fiyat_check CHECK (((elit_fiyat IS NULL) OR (elit_fiyat >= (0)::numeric)));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_prime_fiyat_check CHECK (((prime_fiyat IS NULL) OR (prime_fiyat >= (0)::numeric)));
ALTER TABLE hasta ADD CONSTRAINT hasta_kategori_check CHECK ((kategori = ANY (ARRAY['vita'::text, 'plus'::text, 'elit'::text, 'prime'::text])));
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_vita_pct_check CHECK (((vita_pct >= (0)::numeric) AND (vita_pct <= (100)::numeric)));
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_plus_pct_check CHECK (((plus_pct >= (0)::numeric) AND (plus_pct <= (100)::numeric)));
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_elit_pct_check CHECK (((elit_pct >= (0)::numeric) AND (elit_pct <= (100)::numeric)));
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_prime_pct_check CHECK (((prime_pct >= (0)::numeric) AND (prime_pct <= (100)::numeric)));
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_haftanin_gunu_check CHECK (((haftanin_gunu >= 0) AND (haftanin_gunu <= 6)));
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_aralik_gecerli CHECK (((gecerlilik_bitis IS NULL) OR (gecerlilik_bitis >= gecerlilik_baslangic)));
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_yil_check CHECK (((yil >= 2020) AND (yil <= 2100)));
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_ay_check CHECK (((ay >= 1) AND (ay <= 12)));
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_durum_check CHECK ((durum = ANY (ARRAY['acik'::text, 'kapali'::text])));
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_mola_dakika_check CHECK ((mola_dakika >= 0));
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_fm_onay_durumu_check CHECK ((fm_onay_durumu = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])));
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_durum_check CHECK ((durum = ANY (ARRAY['calisti'::text, 'izinli'::text, 'raporlu'::text, 'gelmedi'::text, 'resmi_tatil'::text])));
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_cikis_giristen_sonra CHECK (((cikis_saat IS NULL) OR (giris_saat IS NULL) OR (cikis_saat > giris_saat)));
ALTER TABLE personel ADD CONSTRAINT personel_fm_saatlik_ucret_check CHECK (((fm_saatlik_ucret IS NULL) OR (fm_saatlik_ucret >= (0)::numeric)));
ALTER TABLE personel_ucret ADD CONSTRAINT personel_ucret_maas_check CHECK ((maas >= (0)::numeric));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_odeme_tipi_check CHECK ((odeme_tipi = ANY (ARRAY['kdv'::text, 'stopaj_muhtasar'::text, 'sgk_primleri'::text, 'damga_vergisi'::text, 'emlak_vergisi'::text, 'motorlu_tasitlar_vergisi'::text, 'bagkur_primleri'::text, 'muhasebe_ucreti'::text, 'trafik_cezasi'::text, 'gec_odeme_faizi'::text, 'gecici_vergi'::text, 'kurumlar_vergisi'::text])));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_tutar_check CHECK ((tutar >= (0)::numeric));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_donem_ay_check CHECK (((donem_ay >= 1) AND (donem_ay <= 12)));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_donem_yil_check CHECK (((donem_yil >= 2000) AND (donem_yil <= 2100)));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_arac_id_tip_check CHECK (((arac_id IS NULL) OR (odeme_tipi = ANY (ARRAY['motorlu_tasitlar_vergisi'::text, 'trafik_cezasi'::text]))));
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_calisma_sekli_check CHECK ((calisma_sekli = ANY (ARRAY['tam_zamanli'::text, 'yari_zamanli'::text])));
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_durum_check CHECK ((durum = ANY (ARRAY['beklemede'::text, 'olumlu'::text, 'olumsuz'::text])));
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_puan_check CHECK (((puan >= 1) AND (puan <= 5)));
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_bos_olamaz CHECK (((puan IS NOT NULL) OR (oneri_metni IS NOT NULL)));
ALTER TABLE hasta ADD CONSTRAINT hasta_olusturan_tip_check CHECK ((olusturan_tip = ANY (ARRAY['personel'::text, 'hasta'::text])));
ALTER TABLE hasta ADD CONSTRAINT hasta_son_guncelleyen_tip_check CHECK ((son_guncelleyen_tip = ANY (ARRAY['personel'::text, 'hasta'::text])));
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_durum_check CHECK ((durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])));
ALTER TABLE paket ADD CONSTRAINT paket_kisi_kotasi_check CHECK (((kisi_kotasi IS NULL) OR (kisi_kotasi > 0)));
ALTER TABLE destek_talebi ADD CONSTRAINT destek_talebi_tur_check CHECK ((tur = ANY (ARRAY['talep'::text, 'sikayet'::text])));
ALTER TABLE destek_talebi ADD CONSTRAINT destek_talebi_durum_check CHECK ((durum = ANY (ARRAY['yeni'::text, 'inceleniyor'::text, 'cozuldu'::text])));
ALTER TABLE mesaj_kredileri ADD CONSTRAINT mesaj_kredileri_bakiye_check CHECK ((bakiye >= 0));
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_sadece_yukleme CHECK ((tip = 'yukleme'::mesaj_kredi_hareket_tipi));
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_durum_check CHECK ((durum = ANY (ARRAY['aktif'::text, 'cozuldu'::text])));
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_olusturan_tip_check CHECK ((olusturan_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_son_guncelleyen_tip_check CHECK ((son_guncelleyen_tip = ANY (ARRAY['hasta'::text, 'personel'::text])));
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_tip_check CHECK ((tip = ANY (ARRAY['yillik'::text, 'mazeret'::text, 'ucretsiz'::text, 'idari'::text, 'telafi'::text])));
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_gun_sayisi_check CHECK ((gun_sayisi > (0)::numeric));
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_durum_check CHECK ((durum = ANY (ARRAY['beklemede'::text, 'onaylandi'::text, 'reddedildi'::text, 'iptal'::text])));
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_tarih_araligi CHECK ((bitis_tarih >= baslangic_tarih));
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_red_gerekce_zorunlu CHECK (((durum <> 'reddedildi'::text) OR ((red_gerekce IS NOT NULL) AND (btrim(red_gerekce) <> ''::text))));
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_kaynak_check CHECK ((kaynak = ANY (ARRAY['manuel'::text, 'tablet'::text, 'self_qr'::text, 'izin_talebi'::text])));
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_tur_check CHECK ((tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text, 'avans'::text, 'kesinti'::text, 'odeme'::text])));
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_tutar_check CHECK ((tutar >= (0)::numeric));
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_hakedis_kaynakli CHECK (((tur <> 'hakedis'::text) OR (kaynak_id IS NOT NULL)));
ALTER TABLE pozisyon_sablonlari ADD CONSTRAINT pozisyon_sablonlari_ucret_tipi_check CHECK ((ucret_tipi = ANY (ARRAY['aylik_maas'::text, 'prim_usulu'::text])));
ALTER TABLE pozisyon_sablonlari ADD CONSTRAINT pozisyon_sablonlari_puantaj_modu_check CHECK ((puantaj_modu = ANY (ARRAY['gunluk'::text, 'esnek'::text, 'takipsiz'::text])));
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_ucret_tipi_check CHECK ((ucret_tipi = ANY (ARRAY['aylik_maas'::text, 'prim_usulu'::text])));
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_puantaj_modu_check CHECK ((puantaj_modu = ANY (ARRAY['gunluk'::text, 'esnek'::text, 'takipsiz'::text])));
ALTER TABLE klinik_banka_hesaplari ADD CONSTRAINT klinik_banka_hesaplari_hesap_tipi_check CHECK ((hesap_tipi = ANY (ARRAY['klinik'::text, 'sahis'::text])));
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_kategori_check CHECK ((kategori = ANY (ARRAY['kira'::text, 'fatura'::text, 'malzeme'::text, 'bakim_hizmet'::text, 'diger'::text])));
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_odeme_tipi_check CHECK ((odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text])));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_odeme_yontemi_check CHECK ((odeme_yontemi = ANY (ARRAY['nakit'::text, 'kredi_karti'::text, 'banka_havalesi'::text])));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_tip_check CHECK ((tip = ANY (ARRAY['giden'::text, 'gelen'::text, 'hesaplar_arasi'::text])));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_odeme_yontemi_check CHECK ((odeme_yontemi = ANY (ARRAY['nakit'::text, 'banka_havalesi'::text])));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_tutar_check CHECK ((tutar > (0)::numeric));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_kaynak_kurali CHECK ((((tip = 'gelen'::text) AND (NOT kaynak_kasa) AND (kaynak_banka_hesap_id IS NULL)) OR ((tip = ANY (ARRAY['giden'::text, 'hesaplar_arasi'::text])) AND ((kaynak_kasa AND (kaynak_banka_hesap_id IS NULL)) OR ((NOT kaynak_kasa) AND (kaynak_banka_hesap_id IS NOT NULL))))));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_hedef_kurali CHECK ((((tip = 'giden'::text) AND (NOT hedef_kasa) AND (hedef_banka_hesap_id IS NULL)) OR ((tip = ANY (ARRAY['gelen'::text, 'hesaplar_arasi'::text])) AND ((hedef_kasa AND (hedef_banka_hesap_id IS NULL)) OR ((NOT hedef_kasa) AND (hedef_banka_hesap_id IS NOT NULL))))));
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_sure_dakika_check CHECK (((sure_dakika IS NULL) OR (sure_dakika > 0)));
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_tur_check CHECK ((tur = ANY (ARRAY['terapist_yorumu'::text, 'randevu_yorumu'::text])));
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_puan_check CHECK (((puan >= 1) AND (puan <= 5)));
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_sure_dakika_check CHECK (((sure_dakika IS NULL) OR (sure_dakika >= 1)));
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_sure_dakika_check CHECK (((sure_dakika IS NULL) OR (sure_dakika >= 1)));
ALTER TABLE randevu ADD CONSTRAINT randevu_planlanan_iskonto_tutari_check CHECK (((planlanan_iskonto_tutari IS NULL) OR (planlanan_iskonto_tutari >= (0)::numeric)));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_belge_turu_check CHECK ((belge_turu = ANY (ARRAY['fatura'::text, 'fis'::text, 'serbest'::text])));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_iade_yontem_zorunlu CHECK (((tur <> 'iade'::text) OR (odeme_yontemi IS NOT NULL))) NOT VALID;
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_tur_check CHECK ((tur = ANY (ARRAY['adim'::text, 'manuel'::text])));
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_check CHECK ((bitis > baslangic));
ALTER TABLE kasa_dengeleme ADD CONSTRAINT kasa_dengeleme_tutar_check CHECK ((tutar <> (0)::numeric));
ALTER TABLE klinik_kredi_kartlari ADD CONSTRAINT klinik_kredi_kartlari_kart_tipi_check CHECK ((kart_tipi = ANY (ARRAY['klinik'::text, 'sahis'::text])));
ALTER TABLE klinik_kredi_kartlari ADD CONSTRAINT klinik_kredi_kartlari_son_dort_hane_check CHECK (((son_dort_hane IS NULL) OR (son_dort_hane ~ '^\d{4}$'::text)));
ALTER TABLE klinik ADD CONSTRAINT klinik_kredi_karti_komisyon_orani_check CHECK (((kredi_karti_komisyon_orani >= (0)::numeric) AND (kredi_karti_komisyon_orani <= 3.5)));
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_komisyon_orani_check CHECK (((komisyon_orani IS NULL) OR ((komisyon_orani >= (0)::numeric) AND (komisyon_orani <= 3.5))));
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_odeme_tipi_check CHECK ((odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text, 'kredi_karti'::text, 'cari'::text])));
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_cari_tedarikci_check CHECK (((odeme_tipi IS DISTINCT FROM 'cari'::text) OR ((tedarikci_adi IS NOT NULL) AND (btrim(tedarikci_adi) <> ''::text))));
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_tedarikci_adi_check CHECK ((btrim(tedarikci_adi) <> ''::text));
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_tutar_check CHECK ((tutar > (0)::numeric));
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_odeme_tipi_check CHECK ((odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text, 'kredi_karti'::text])));
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_tutar_check CHECK ((tutar > (0)::numeric));
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_odeme_tipi_check CHECK ((odeme_tipi = ANY (ARRAY['nakit'::text, 'havale'::text])));
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_yil_check CHECK (((yil >= 2000) AND (yil <= 2100)));
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_bayram_check CHECK ((bayram = ANY (ARRAY['ramazan'::text, 'kurban'::text])));
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_durum_check CHECK ((durum = ANY (ARRAY['bekliyor'::text, 'onaylandi'::text, 'reddedildi'::text])));
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_odeme_yontemi_check CHECK ((odeme_yontemi = ANY (ARRAY['nakit'::text, 'havale'::text])));
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_farkli_hesap CHECK (((tip <> 'hesaplar_arasi'::text) OR ((NOT (kaynak_kasa AND hedef_kasa)) AND ((kaynak_banka_hesap_id IS NULL) OR (kaynak_banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id))))) NOT VALID;
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_metin_uzunluk CHECK (((COALESCE(length(oneri_metni), 0) <= 2000) AND (COALESCE(length(ad_soyad), 0) <= 120) AND (COALESCE(length(telefon), 0) <= 20))) NOT VALID;
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_metin_uzunluk CHECK ((COALESCE(length(oneri_metni), 0) <= 2000)) NOT VALID;
ALTER TABLE randevu ADD CONSTRAINT randevu_oda_cakisma EXCLUDE USING gist (oda_id WITH =, zaman_araligi WITH &&) WHERE ((durum <> ALL (ARRAY['iptal'::randevu_durum_tipi, 'gelmedi'::randevu_durum_tipi])));
ALTER TABLE randevu ADD CONSTRAINT randevu_terapist_cakisma EXCLUDE USING gist (terapist_id WITH =, zaman_araligi WITH &&) WHERE ((durum <> ALL (ARRAY['iptal'::randevu_durum_tipi, 'gelmedi'::randevu_durum_tipi])));
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_cakisma_yok EXCLUDE USING gist (personel_id WITH =, haftanin_gunu WITH =, daterange(gecerlilik_baslangic, gecerlilik_bitis, '[]'::text) WITH &&);
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_cakisma EXCLUDE USING gist (cihaz_id WITH =, zaman_araligi WITH &&);
ALTER TABLE kullanici ADD CONSTRAINT kullanici_id_fkey FOREIGN KEY (id) REFERENCES kimlik_kullanici(id) ON DELETE CASCADE;
ALTER TABLE kullanici ADD CONSTRAINT kullanici_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel ADD CONSTRAINT personel_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel ADD CONSTRAINT personel_kullanici_id_fkey FOREIGN KEY (kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE terapist ADD CONSTRAINT terapist_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE terapist ADD CONSTRAINT terapist_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE hasta ADD CONSTRAINT hasta_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE oda ADD CONSTRAINT oda_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE cihaz ADD CONSTRAINT cihaz_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu ADD CONSTRAINT randevu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu ADD CONSTRAINT randevu_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu ADD CONSTRAINT randevu_terapist_id_fkey FOREIGN KEY (terapist_id) REFERENCES terapist(id) ON DELETE RESTRICT;
ALTER TABLE randevu ADD CONSTRAINT randevu_oda_id_fkey FOREIGN KEY (oda_id) REFERENCES oda(id) ON DELETE RESTRICT;
ALTER TABLE randevu ADD CONSTRAINT randevu_cihaz_id_fkey FOREIGN KEY (cihaz_id) REFERENCES cihaz(id) ON DELETE RESTRICT;
ALTER TABLE klinik_ayarlar ADD CONSTRAINT klinik_ayarlar_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_kategori ADD CONSTRAINT islem_kategori_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi ADD CONSTRAINT islem_tanimi_islem_kategori_id_fkey FOREIGN KEY (islem_kategori_id) REFERENCES islem_kategori(id) ON DELETE RESTRICT;
ALTER TABLE paket ADD CONSTRAINT paket_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE paket ADD CONSTRAINT paket_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE RESTRICT;
ALTER TABLE odeme ADD CONSTRAINT odeme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE odeme ADD CONSTRAINT odeme_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE RESTRICT;
ALTER TABLE odeme ADD CONSTRAINT odeme_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_paket_id_fkey FOREIGN KEY (paket_id) REFERENCES paket(id) ON DELETE RESTRICT;
ALTER TABLE paket_satis ADD CONSTRAINT paket_satis_odeme_id_fkey FOREIGN KEY (odeme_id) REFERENCES odeme(id) ON DELETE SET NULL;
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_odeme_id_fkey FOREIGN KEY (odeme_id) REFERENCES odeme(id) ON DELETE CASCADE;
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE SET NULL;
ALTER TABLE odeme_kalemi ADD CONSTRAINT odeme_kalemi_paket_satis_id_fkey FOREIGN KEY (paket_satis_id) REFERENCES paket_satis(id) ON DELETE SET NULL;
ALTER TABLE odeme_satiri ADD CONSTRAINT odeme_satiri_odeme_id_fkey FOREIGN KEY (odeme_id) REFERENCES odeme(id) ON DELETE CASCADE;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_odeme_id_fkey FOREIGN KEY (odeme_id) REFERENCES odeme(id) ON DELETE SET NULL;
ALTER TABLE fatura ADD CONSTRAINT fatura_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE fatura ADD CONSTRAINT fatura_odeme_id_fkey FOREIGN KEY (odeme_id) REFERENCES odeme(id) ON DELETE CASCADE;
ALTER TABLE hasta_kullanici ADD CONSTRAINT hasta_kullanici_id_fkey FOREIGN KEY (id) REFERENCES kimlik_kullanici(id) ON DELETE CASCADE;
ALTER TABLE hasta_kullanici ADD CONSTRAINT hasta_kullanici_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu_iptal_talebi ADD CONSTRAINT randevu_iptal_talebi_yanit_kullanici_id_fkey FOREIGN KEY (yanit_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_muhasebe_entegrasyonu ADD CONSTRAINT klinik_muhasebe_entegrasyonu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu ADD CONSTRAINT randevu_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE SET NULL;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_terapist_id_fkey FOREIGN KEY (terapist_id) REFERENCES terapist(id) ON DELETE RESTRICT;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_oda_id_fkey FOREIGN KEY (oda_id) REFERENCES oda(id) ON DELETE RESTRICT;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_cihaz_id_fkey FOREIGN KEY (cihaz_id) REFERENCES cihaz(id) ON DELETE RESTRICT;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE RESTRICT;
ALTER TABLE periyodik_randevu ADD CONSTRAINT periyodik_randevu_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_periyodik_randevu_id_fkey FOREIGN KEY (periyodik_randevu_id) REFERENCES periyodik_randevu(id) ON DELETE SET NULL;
ALTER TABLE islem_kontrendikasyon ADD CONSTRAINT islem_kontrendikasyon_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_kontrendikasyon ADD CONSTRAINT islem_kontrendikasyon_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE CASCADE;
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_hedef ADD CONSTRAINT hasta_hedef_olusturan_id_fkey FOREIGN KEY (olusturan_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE olcek_tanimi ADD CONSTRAINT olcek_tanimi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE SET NULL;
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_olcek_tanimi_id_fkey FOREIGN KEY (olcek_tanimi_id) REFERENCES olcek_tanimi(id) ON DELETE RESTRICT;
ALTER TABLE hasta_olcum ADD CONSTRAINT hasta_olcum_giren_kullanici_id_fkey FOREIGN KEY (giren_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE egzersiz_kutuphanesi ADD CONSTRAINT egzersiz_kutuphanesi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_programi ADD CONSTRAINT ev_egzersiz_programi_atayan_terapist_id_fkey FOREIGN KEY (atayan_terapist_id) REFERENCES terapist(id) ON DELETE SET NULL;
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_program_id_fkey FOREIGN KEY (program_id) REFERENCES ev_egzersiz_programi(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_kalemi ADD CONSTRAINT ev_egzersiz_kalemi_egzersiz_id_fkey FOREIGN KEY (egzersiz_id) REFERENCES egzersiz_kutuphanesi(id) ON DELETE RESTRICT;
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_program_id_fkey FOREIGN KEY (program_id) REFERENCES ev_egzersiz_programi(id) ON DELETE CASCADE;
ALTER TABLE ev_egzersiz_takip ADD CONSTRAINT ev_egzersiz_takip_kalem_id_fkey FOREIGN KEY (kalem_id) REFERENCES ev_egzersiz_kalemi(id) ON DELETE CASCADE;
ALTER TABLE seans_checklist_sablonu ADD CONSTRAINT seans_checklist_sablonu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_checklist ADD CONSTRAINT randevu_checklist_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_checklist ADD CONSTRAINT randevu_checklist_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE randevu_checklist ADD CONSTRAINT randevu_checklist_sablon_id_fkey FOREIGN KEY (sablon_id) REFERENCES seans_checklist_sablonu(id) ON DELETE RESTRICT;
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_ilgili_randevu_id_fkey FOREIGN KEY (ilgili_randevu_id) REFERENCES randevu(id) ON DELETE SET NULL;
ALTER TABLE hasta_iletisim_log ADD CONSTRAINT hasta_iletisim_log_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE SET NULL;
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_anket ADD CONSTRAINT hasta_anket_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE randevu_on_form ADD CONSTRAINT randevu_on_form_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_iliski ADD CONSTRAINT hasta_iliski_iliskili_hasta_id_fkey FOREIGN KEY (iliskili_hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_sigorta ADD CONSTRAINT hasta_sigorta_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_sigorta ADD CONSTRAINT hasta_sigorta_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_yukleyen_kullanici_id_fkey FOREIGN KEY (yukleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_onceki_belge_id_fkey FOREIGN KEY (onceki_belge_id) REFERENCES hasta_belge(id) ON DELETE SET NULL;
ALTER TABLE hasta_onam ADD CONSTRAINT hasta_onam_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_onam ADD CONSTRAINT hasta_onam_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_onam ADD CONSTRAINT hasta_onam_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_belge ADD CONSTRAINT hasta_belge_onam_id_fkey FOREIGN KEY (onam_id) REFERENCES hasta_onam(id) ON DELETE RESTRICT;
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE SET NULL;
ALTER TABLE hasta_vucut_haritasi_isareti ADD CONSTRAINT hasta_vucut_haritasi_isareti_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE RESTRICT;
ALTER TABLE hasta_protokol ADD CONSTRAINT hasta_protokol_atayan_terapist_id_fkey FOREIGN KEY (atayan_terapist_id) REFERENCES terapist(id) ON DELETE SET NULL;
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_hassas ADD CONSTRAINT personel_hassas_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_acil_kisi ADD CONSTRAINT personel_acil_kisi_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_mesleki_belge ADD CONSTRAINT personel_mesleki_belge_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_paket_satis_id_fkey FOREIGN KEY (paket_satis_id) REFERENCES paket_satis(id) ON DELETE SET NULL;
ALTER TABLE hasta ADD CONSTRAINT hasta_kvkk_onaylayan_kullanici_id_fkey FOREIGN KEY (kvkk_onaylayan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta ADD CONSTRAINT hasta_ozel_nitelikli_onaylayan_kullanici_id_fkey FOREIGN KEY (ozel_nitelikli_onaylayan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta ADD CONSTRAINT hasta_ticari_ileti_onaylayan_kullanici_id_fkey FOREIGN KEY (ticari_ileti_onaylayan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_hassas ADD CONSTRAINT hasta_hassas_son_guncelleyen_kullanici_id_fkey FOREIGN KEY (son_guncelleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE tedavi_protokolu ADD CONSTRAINT tedavi_protokolu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_tedavi_protokolu_id_fkey FOREIGN KEY (tedavi_protokolu_id) REFERENCES tedavi_protokolu(id) ON DELETE CASCADE;
ALTER TABLE tedavi_protokolu_adimi ADD CONSTRAINT tedavi_protokolu_adimi_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE RESTRICT;
ALTER TABLE randevu ADD CONSTRAINT randevu_antrenor_id_fkey FOREIGN KEY (antrenor_id) REFERENCES personel(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_tedavi_protokolu_id_fkey FOREIGN KEY (tedavi_protokolu_id) REFERENCES tedavi_protokolu(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_tamamlayan_kullanici_id_fkey FOREIGN KEY (tamamlayan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE anket_yaniti ADD CONSTRAINT anket_yaniti_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_fiyat_gecmisi ADD CONSTRAINT islem_tanimi_fiyat_gecmisi_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_fiyat_gecmisi ADD CONSTRAINT islem_tanimi_fiyat_gecmisi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_fiyat_gecmisi ADD CONSTRAINT islem_tanimi_fiyat_gecmisi_degistiren_kullanici_id_fkey FOREIGN KEY (degistiren_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE iskonto_oranlari ADD CONSTRAINT iskonto_oranlari_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE vardiya_turu ADD CONSTRAINT vardiya_turu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_vardiya_atama ADD CONSTRAINT personel_vardiya_atama_vardiya_turu_id_fkey FOREIGN KEY (vardiya_turu_id) REFERENCES vardiya_turu(id) ON DELETE RESTRICT;
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_puantaj_donem ADD CONSTRAINT personel_puantaj_donem_kapatan_id_fkey FOREIGN KEY (kapatan_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_fm_onaylayan_id_fkey FOREIGN KEY (fm_onaylayan_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_ucret ADD CONSTRAINT personel_ucret_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_ucret ADD CONSTRAINT personel_ucret_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_ucret ADD CONSTRAINT personel_ucret_ekleyen_kullanici_id_fkey FOREIGN KEY (ekleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE klinik_arac ADD CONSTRAINT klinik_arac_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_arac ADD CONSTRAINT klinik_arac_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_arac_id_fkey FOREIGN KEY (arac_id) REFERENCES klinik_arac(id) ON DELETE SET NULL;
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_degerlendiren_kullanici_id_fkey FOREIGN KEY (degerlendiren_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE is_basvurusu ADD CONSTRAINT is_basvurusu_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE SET NULL;
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE seans_degerlendirme ADD CONSTRAINT seans_degerlendirme_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id);
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_terapist_id_fkey FOREIGN KEY (terapist_id) REFERENCES terapist(id) ON DELETE SET NULL;
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_olusturulan_randevu_id_fkey FOREIGN KEY (olusturulan_randevu_id) REFERENCES randevu(id) ON DELETE SET NULL;
ALTER TABLE randevu_talebi ADD CONSTRAINT randevu_talebi_yanit_kullanici_id_fkey FOREIGN KEY (yanit_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_iskonto_uygulayan_kullanici_id_fkey FOREIGN KEY (iskonto_uygulayan_kullanici_id) REFERENCES kullanici(id);
ALTER TABLE destek_talebi ADD CONSTRAINT destek_talebi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE destek_talebi ADD CONSTRAINT destek_talebi_kullanici_id_fkey FOREIGN KEY (kullanici_id) REFERENCES kullanici(id) ON DELETE CASCADE;
ALTER TABLE mesaj_kurallari ADD CONSTRAINT mesaj_kurallari_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE mesaj_kuyrugu ADD CONSTRAINT mesaj_kuyrugu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE mesaj_kredileri ADD CONSTRAINT mesaj_kredileri_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_kuyruk_id_fkey FOREIGN KEY (kuyruk_id) REFERENCES mesaj_kuyrugu(id) ON DELETE SET NULL;
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE hasta_anamnez ADD CONSTRAINT hasta_anamnez_son_guncelleyen_kullanici_id_fkey FOREIGN KEY (son_guncelleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE resmi_tatil ADD CONSTRAINT resmi_tatil_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_degerlendiren_kullanici_id_fkey FOREIGN KEY (degerlendiren_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_izin_talebi ADD CONSTRAINT personel_izin_talebi_iptal_eden_kullanici_id_fkey FOREIGN KEY (iptal_eden_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_puantaj ADD CONSTRAINT personel_puantaj_izin_talep_id_fkey FOREIGN KEY (izin_talep_id) REFERENCES personel_izin_talebi(id) ON DELETE SET NULL;
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_kaynak_id_fkey FOREIGN KEY (kaynak_id) REFERENCES personel_puantaj_donem(id) ON DELETE SET NULL;
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_ekleyen_kullanici_id_fkey FOREIGN KEY (ekleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE pozisyonlar ADD CONSTRAINT pozisyonlar_sablon_id_fkey FOREIGN KEY (sablon_id) REFERENCES pozisyon_sablonlari(id) ON DELETE SET NULL;
ALTER TABLE personel ADD CONSTRAINT personel_pozisyon_id_fkey FOREIGN KEY (pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL;
ALTER TABLE klinik_banka_hesaplari ADD CONSTRAINT klinik_banka_hesaplari_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_arac_id_fkey FOREIGN KEY (arac_id) REFERENCES klinik_arac(id) ON DELETE SET NULL;
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE personel_hesap_hareket ADD CONSTRAINT personel_hesap_hareket_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE hasta_bakiye_hareket ADD CONSTRAINT hasta_bakiye_hareket_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_kaynak_banka_hesap_id_fkey FOREIGN KEY (kaynak_banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE RESTRICT;
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_hedef_banka_hesap_id_fkey FOREIGN KEY (hedef_banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE RESTRICT;
ALTER TABLE nakit_banka_hareketi ADD CONSTRAINT nakit_banka_hareketi_ekleyen_kullanici_id_fkey FOREIGN KEY (ekleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE personel_egitim ADD CONSTRAINT personel_egitim_personel_id_fkey FOREIGN KEY (personel_id) REFERENCES personel(id) ON DELETE CASCADE;
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_hasta_id_fkey FOREIGN KEY (hasta_id) REFERENCES hasta(id) ON DELETE CASCADE;
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE hasta_yorum ADD CONSTRAINT hasta_yorum_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_islem_tanimi_id_fkey FOREIGN KEY (islem_tanimi_id) REFERENCES islem_tanimi(id) ON DELETE CASCADE;
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_gerekli_cihaz_id_fkey FOREIGN KEY (gerekli_cihaz_id) REFERENCES cihaz(id) ON DELETE SET NULL;
ALTER TABLE islem_tanimi_adim ADD CONSTRAINT islem_tanimi_adim_uygulayici_pozisyon_id_fkey FOREIGN KEY (uygulayici_pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL;
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_uygulayici_pozisyon_id_fkey FOREIGN KEY (uygulayici_pozisyon_id) REFERENCES pozisyonlar(id) ON DELETE SET NULL;
ALTER TABLE islem_adimi_sablonu ADD CONSTRAINT islem_adimi_sablonu_gerekli_cihaz_id_fkey FOREIGN KEY (gerekli_cihaz_id) REFERENCES cihaz(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_klinik_id_fkey1 FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_kullanici_id_fkey1 FOREIGN KEY (kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_randevu_id_fkey FOREIGN KEY (randevu_id) REFERENCES randevu(id) ON DELETE CASCADE;
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_cihaz_id_fkey FOREIGN KEY (cihaz_id) REFERENCES cihaz(id) ON DELETE CASCADE;
ALTER TABLE randevu_cihaz_rezervasyon ADD CONSTRAINT randevu_cihaz_rezervasyon_adim_id_fkey FOREIGN KEY (adim_id) REFERENCES islem_tanimi_adim(id) ON DELETE SET NULL;
ALTER TABLE kasa_dengeleme ADD CONSTRAINT kasa_dengeleme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE kasa_dengeleme ADD CONSTRAINT kasa_dengeleme_ekleyen_kullanici_id_fkey FOREIGN KEY (ekleyen_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE randevu ADD CONSTRAINT randevu_iptal_eden_kullanici_id_fkey FOREIGN KEY (iptal_eden_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE klinik_kredi_kartlari ADD CONSTRAINT klinik_kredi_kartlari_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik ADD CONSTRAINT klinik_kredi_karti_tahsilat_banka_hesap_id_fkey FOREIGN KEY (kredi_karti_tahsilat_banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE klinik_harcama ADD CONSTRAINT klinik_harcama_kredi_karti_id_fkey FOREIGN KEY (kredi_karti_id) REFERENCES klinik_kredi_kartlari(id) ON DELETE SET NULL;
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_kredi_karti_id_fkey FOREIGN KEY (kredi_karti_id) REFERENCES klinik_kredi_kartlari(id) ON DELETE SET NULL;
ALTER TABLE klinik_cari_odeme ADD CONSTRAINT klinik_cari_odeme_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_kredi_karti_id_fkey FOREIGN KEY (kredi_karti_id) REFERENCES klinik_kredi_kartlari(id);
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;
ALTER TABLE klinik_kredi_karti_odeme ADD CONSTRAINT klinik_kredi_karti_odeme_olusturan_kullanici_id_fkey FOREIGN KEY (olusturan_kullanici_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_klinik_id_fkey FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE;
ALTER TABLE resmi_tatil_oneri ADD CONSTRAINT resmi_tatil_oneri_karar_veren_id_fkey FOREIGN KEY (karar_veren_id) REFERENCES kullanici(id) ON DELETE SET NULL;
ALTER TABLE kamusal_odeme ADD CONSTRAINT kamusal_odeme_banka_hesap_id_fkey FOREIGN KEY (banka_hesap_id) REFERENCES klinik_banka_hesaplari(id) ON DELETE SET NULL;

-- ===== Görünümler =====
CREATE VIEW v_hasta_ozet WITH (security_invoker=true) AS
 SELECT m.id AS hasta_id,
    m.klinik_id,
    vas.son_skor AS son_vas_skoru,
    vas.son_tarih AS son_vas_tarihi,
    COALESCE(hedef.aktif_hedef_sayisi, 0::bigint) AS aktif_hedef_sayisi,
    COALESCE(paket.kalan_paket_hakki, 0::bigint) AS kalan_paket_hakki,
    COALESCE(bakiye.bakiye, 0::numeric) AS bakiye,
    seans.son_seans_tarihi,
    jsonb_array_length(COALESCE(m.risk_bayraklari, '[]'::jsonb)) AS aktif_risk_bayrak_sayisi,
    COALESCE(noshow.no_show_sayisi, 0::bigint) AS no_show_sayisi
   FROM hasta m
     LEFT JOIN LATERAL ( SELECT mo.hesaplanan_skor AS son_skor,
            mo.olcum_tarihi AS son_tarih
           FROM hasta_olcum mo
             JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id
          WHERE mo.hasta_id = m.id AND ot.kod = 'VAS'::text
          ORDER BY mo.olcum_tarihi DESC
         LIMIT 1) vas ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS aktif_hedef_sayisi
           FROM hasta_hedef mh
          WHERE mh.hasta_id = m.id AND mh.durum = 'aktif'::text) hedef ON true
     LEFT JOIN LATERAL ( SELECT sum(ps.kalan_adet) AS kalan_paket_hakki
           FROM paket_satis ps
          WHERE ps.hasta_id = m.id AND ps.durum = 'aktif'::text) paket ON true
     LEFT JOIN LATERAL ( SELECT sum(
                CASE
                    WHEN mb.tur = 'kredi'::text THEN mb.tutar
                    WHEN mb.tur = 'borc'::text THEN - (mb.tutar - mb.iskonto_tutari)
                    WHEN mb.tur = 'odeme'::text AND mb.odeme_id IS NULL THEN mb.tutar
                    WHEN mb.tur = 'iade'::text AND mb.odeme_id IS NULL THEN - mb.tutar
                    ELSE 0::numeric
                END) AS bakiye
           FROM hasta_bakiye_hareket mb
          WHERE mb.hasta_id = m.id) bakiye ON true
     LEFT JOIN LATERAL ( SELECT max(r.baslangic) AS son_seans_tarihi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'geldi'::randevu_durum_tipi) seans ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS no_show_sayisi
           FROM randevu r
          WHERE r.hasta_id = m.id AND r.durum = 'gelmedi'::randevu_durum_tipi) noshow ON true;

CREATE MATERIALIZED VIEW mv_hasta_ilerleme AS
 SELECT mo.id,
    mo.klinik_id,
    mo.hasta_id,
    mo.olcek_tanimi_id,
    ot.kod AS olcek_kod,
    ot.ad AS olcek_ad,
    ot.yorum_yonu,
    mo.randevu_id,
    mo.hesaplanan_skor,
    mo.olcum_tarihi
   FROM hasta_olcum mo
     JOIN olcek_tanimi ot ON ot.id = mo.olcek_tanimi_id
WITH NO DATA;

CREATE VIEW v_hasta_ilerleme AS
 SELECT id,
    klinik_id,
    hasta_id,
    olcek_tanimi_id,
    olcek_kod,
    olcek_ad,
    yorum_yonu,
    randevu_id,
    hesaplanan_skor,
    olcum_tarihi
   FROM mv_hasta_ilerleme
  WHERE klinik_id = current_klinik_id() OR is_super_admin();

CREATE VIEW v_hasta_karsilastirma WITH (security_invoker=true) AS
 SELECT karsilastirma_grubu_id,
    id AS belge_id,
    hasta_id,
    klinik_id,
    bolge,
    asama,
    cekim_tarihi,
    storage_path,
    thumbnail_path
   FROM hasta_belge mb
  WHERE karsilastirma_grubu_id IS NOT NULL
  ORDER BY karsilastirma_grubu_id, cekim_tarihi;

CREATE VIEW v_hasta_detay_ozet WITH (security_invoker=true) AS
 SELECT vmo.hasta_id,
    vmo.klinik_id,
    vmo.son_vas_skoru,
    vmo.son_vas_tarihi,
    vmo.aktif_hedef_sayisi,
    vmo.kalan_paket_hakki,
    vmo.bakiye,
    vmo.son_seans_tarihi,
    vmo.aktif_risk_bayrak_sayisi,
    vmo.no_show_sayisi,
    randevu.sonraki_randevu_tarihi,
    protokol.aktif_protokol_ad,
    COALESCE(olcum.olcum_sayisi, 0::bigint) AS olcum_sayisi,
    COALESCE(belge.belge_sayisi, 0::bigint) AS belge_sayisi,
    iletisim.son_iletisim_tarihi
   FROM v_hasta_ozet vmo
     LEFT JOIN LATERAL ( SELECT r.baslangic AS sonraki_randevu_tarihi
           FROM randevu r
          WHERE r.hasta_id = vmo.hasta_id AND r.durum = 'planlandi'::randevu_durum_tipi AND r.baslangic >= now()
          ORDER BY r.baslangic
         LIMIT 1) randevu ON true
     LEFT JOIN LATERAL ( SELECT it.ad AS aktif_protokol_ad
           FROM hasta_protokol mp
             JOIN islem_tanimi it ON it.id = mp.islem_tanimi_id
          WHERE mp.hasta_id = vmo.hasta_id AND mp.durum = 'aktif'::text
          ORDER BY mp.baslangic_tarihi DESC
         LIMIT 1) protokol ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS olcum_sayisi
           FROM hasta_olcum mo
          WHERE mo.hasta_id = vmo.hasta_id) olcum ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS belge_sayisi
           FROM hasta_belge mb
          WHERE mb.hasta_id = vmo.hasta_id AND mb.is_guncel = true AND mb.deleted_at IS NULL) belge ON true
     LEFT JOIN LATERAL ( SELECT max(mil.olusturma_tarihi) AS son_iletisim_tarihi
           FROM hasta_iletisim_log mil
          WHERE mil.hasta_id = vmo.hasta_id) iletisim ON true;

CREATE VIEW v_personel_bilgi_durumu WITH (security_invoker=true) AS
 SELECT p.id AS personel_id,
    p.dogum_tarihi IS NOT NULL AND (COALESCE(p.il, ''::text) <> ''::text OR COALESCE(p.adres, ''::text) <> ''::text) AND (EXISTS ( SELECT 1
           FROM personel_acil_kisi ak
          WHERE ak.personel_id = p.id)) AND (EXISTS ( SELECT 1
           FROM personel_hassas ph
          WHERE ph.personel_id = p.id AND (ph.tc_kimlik IS NOT NULL OR ph.pasaport_no IS NOT NULL))) AND (k.rol IS DISTINCT FROM 'terapist'::kullanici_rol_tipi OR (EXISTS ( SELECT 1
           FROM personel_mesleki_belge mb
          WHERE mb.personel_id = p.id AND (mb.diploma_no IS NOT NULL OR mb.uzmanlik_belge_no IS NOT NULL)))) AS bilgiler_tamam
   FROM personel p
     LEFT JOIN kullanici k ON k.id = p.kullanici_id;

CREATE VIEW v_hasta_cari_ozet WITH (security_invoker=true) AS
 SELECT h.id AS hasta_id,
    h.klinik_id,
    h.ad_soyad,
    cari.borc - cari.tahsil AS kalan_bakiye,
    cari.tahsil AS tahsil_edilen,
    cari.borc AS toplam_bakiye
   FROM hasta h
     JOIN LATERAL ( SELECT COALESCE(sum(b.tutar - b.iskonto_tutari) FILTER (WHERE b.tur = 'borc'::text), 0::numeric) AS borc,
            COALESCE(sum(
                CASE
                    WHEN b.tur = 'kredi'::text THEN b.tutar
                    WHEN b.tur = 'odeme'::text AND b.odeme_id IS NULL THEN b.tutar
                    WHEN b.tur = 'iade'::text AND b.odeme_id IS NULL THEN - b.tutar
                    ELSE 0::numeric
                END), 0::numeric) AS tahsil
           FROM hasta_bakiye_hareket b
          WHERE b.hasta_id = h.id) cari ON true
  WHERE (cari.borc - cari.tahsil) > 0::numeric;

CREATE VIEW v_personel_izin_bakiye WITH (security_invoker=true) AS
 SELECT id AS personel_id,
    klinik_id,
    personel_izin_hak_gun_hesapla(id) AS hak_gun,
    izin_devir_gun AS devir_gun,
    izin_duzeltme_gun AS duzeltme_gun,
    COALESCE(( SELECT sum(t.gun_sayisi) AS sum
           FROM personel_izin_talebi t
          WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'onaylandi'::text), 0::numeric) AS onaylanan_gun,
    COALESCE(( SELECT sum(t.gun_sayisi) AS sum
           FROM personel_izin_talebi t
          WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'beklemede'::text), 0::numeric) AS beklemede_gun,
    personel_izin_hak_gun_hesapla(id) + izin_devir_gun + izin_duzeltme_gun - COALESCE(( SELECT sum(t.gun_sayisi) AS sum
           FROM personel_izin_talebi t
          WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'onaylandi'::text), 0::numeric) - COALESCE(( SELECT sum(t.gun_sayisi) AS sum
           FROM personel_izin_talebi t
          WHERE t.personel_id = p.id AND t.tip = 'yillik'::text AND t.durum = 'beklemede'::text), 0::numeric) AS kalan_gun
   FROM personel p;

CREATE VIEW v_personel_hesap_bakiye WITH (security_invoker=true) AS
 SELECT id AS personel_id,
    klinik_id,
    COALESCE(( SELECT sum(h.tutar) AS sum
           FROM personel_hesap_hareket h
          WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text]))), 0::numeric) AS toplam_hakedis,
    COALESCE(( SELECT sum(h.tutar) AS sum
           FROM personel_hesap_hareket h
          WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['avans'::text, 'kesinti'::text, 'odeme'::text]))), 0::numeric) AS toplam_odenen,
    COALESCE(( SELECT sum(h.tutar) AS sum
           FROM personel_hesap_hareket h
          WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['hakedis'::text, 'prim'::text, 'yol'::text, 'yemek'::text, 'mesai'::text]))), 0::numeric) - COALESCE(( SELECT sum(h.tutar) AS sum
           FROM personel_hesap_hareket h
          WHERE h.personel_id = p.id AND (h.tur = ANY (ARRAY['avans'::text, 'kesinti'::text, 'odeme'::text]))), 0::numeric) AS bakiye
   FROM personel p;

CREATE VIEW klinik_kredi_karti_hareketleri WITH (security_invoker=true) AS
 SELECT 'gider'::text AS kaynak,
    h.id::text AS id,
    h.klinik_id,
    h.kredi_karti_id,
    h.tarih,
    'harcama'::text AS tip,
    h.tutar::numeric AS tutar,
    h.tedarikci_adi AS ad,
    h.aciklama AS detay,
    NULL::text AS yontem,
    NULL::uuid AS banka_hesap_id
   FROM klinik_harcama h
  WHERE h.odeme_tipi = 'kredi_karti'::text
UNION ALL
 SELECT 'cari_odeme'::text AS kaynak,
    o.id::text AS id,
    o.klinik_id,
    o.kredi_karti_id,
    o.tarih,
    'harcama'::text AS tip,
    o.tutar::numeric AS tutar,
    o.tedarikci_adi AS ad,
    o.aciklama AS detay,
    NULL::text AS yontem,
    NULL::uuid AS banka_hesap_id
   FROM klinik_cari_odeme o
  WHERE o.odeme_tipi = 'kredi_karti'::text
UNION ALL
 SELECT 'kart_odemesi'::text AS kaynak,
    p.id::text AS id,
    p.klinik_id,
    p.kredi_karti_id,
    p.tarih,
    'odeme'::text AS tip,
    p.tutar::numeric AS tutar,
    NULL::text AS ad,
    p.aciklama AS detay,
    p.odeme_tipi AS yontem,
    p.banka_hesap_id
   FROM klinik_kredi_karti_odeme p;

-- ===== İndeksler =====
CREATE INDEX idx_kullanici_klinik_id ON kullanici USING btree (klinik_id);
CREATE INDEX idx_personel_klinik_id ON personel USING btree (klinik_id);
CREATE INDEX idx_terapist_klinik_id ON terapist USING btree (klinik_id);
CREATE INDEX idx_hasta_klinik_id ON hasta USING btree (klinik_id);
CREATE INDEX idx_hasta_telefon ON hasta USING btree (telefon);
CREATE INDEX idx_oda_klinik_id ON oda USING btree (klinik_id);
CREATE INDEX idx_cihaz_klinik_id ON cihaz USING btree (klinik_id);
CREATE INDEX idx_randevu_klinik_id ON randevu USING btree (klinik_id);
CREATE INDEX idx_randevu_hasta_id ON randevu USING btree (hasta_id);
CREATE INDEX idx_randevu_baslangic ON randevu USING btree (baslangic);
CREATE INDEX idx_islem_kategori_klinik_id ON islem_kategori USING btree (klinik_id);
CREATE INDEX idx_islem_tanimi_klinik_id ON islem_tanimi USING btree (klinik_id);
CREATE INDEX idx_islem_tanimi_kategori_id ON islem_tanimi USING btree (islem_kategori_id);
CREATE INDEX idx_paket_klinik_id ON paket USING btree (klinik_id);
CREATE INDEX idx_odeme_klinik_id ON odeme USING btree (klinik_id);
CREATE INDEX idx_odeme_hasta_id ON odeme USING btree (hasta_id);
CREATE INDEX idx_paket_satis_klinik_id ON paket_satis USING btree (klinik_id);
CREATE INDEX idx_paket_satis_hasta_id ON paket_satis USING btree (hasta_id);
CREATE INDEX idx_odeme_kalemi_odeme_id ON odeme_kalemi USING btree (odeme_id);
CREATE INDEX idx_odeme_satiri_odeme_id ON odeme_satiri USING btree (odeme_id);
CREATE INDEX idx_hasta_bakiye_hareket_klinik_id ON hasta_bakiye_hareket USING btree (klinik_id);
CREATE INDEX idx_hasta_bakiye_hareket_hasta_id ON hasta_bakiye_hareket USING btree (hasta_id);
CREATE INDEX idx_fatura_klinik_id ON fatura USING btree (klinik_id);
CREATE INDEX idx_fatura_odeme_id ON fatura USING btree (odeme_id);
CREATE INDEX idx_hasta_kullanici_hasta_id ON hasta_kullanici USING btree (hasta_id);
CREATE INDEX idx_randevu_iptal_talebi_klinik_id ON randevu_iptal_talebi USING btree (klinik_id);
CREATE INDEX idx_hasta_hassas_klinik_id ON hasta_hassas USING btree (klinik_id);
CREATE UNIQUE INDEX idx_hasta_hassas_kimlik_no ON hasta_hassas USING btree (klinik_id, kimlik_no) WHERE (kimlik_no IS NOT NULL);
CREATE INDEX idx_randevu_islem_tanimi_id ON randevu USING btree (islem_tanimi_id);
CREATE INDEX idx_periyodik_randevu_klinik_id ON periyodik_randevu USING btree (klinik_id);
CREATE INDEX idx_periyodik_randevu_hasta_id ON periyodik_randevu USING btree (hasta_id);
CREATE INDEX idx_randevu_periyodik_randevu_id ON randevu USING btree (periyodik_randevu_id);
CREATE INDEX idx_islem_kontrendikasyon_klinik_id ON islem_kontrendikasyon USING btree (klinik_id);
CREATE INDEX idx_islem_kontrendikasyon_islem_id ON islem_kontrendikasyon USING btree (islem_tanimi_id);
CREATE INDEX idx_hasta_hedef_klinik_id ON hasta_hedef USING btree (klinik_id);
CREATE INDEX idx_hasta_hedef_hasta_id ON hasta_hedef USING btree (hasta_id);
CREATE INDEX idx_olcek_tanimi_klinik_id ON olcek_tanimi USING btree (klinik_id);
CREATE UNIQUE INDEX idx_olcek_tanimi_kod_platform ON olcek_tanimi USING btree (kod) WHERE (klinik_id IS NULL);
CREATE UNIQUE INDEX idx_olcek_tanimi_kod_klinik ON olcek_tanimi USING btree (klinik_id, kod) WHERE (klinik_id IS NOT NULL);
CREATE INDEX idx_hasta_olcum_klinik_id ON hasta_olcum USING btree (klinik_id);
CREATE INDEX idx_hasta_olcum_hasta_id ON hasta_olcum USING btree (hasta_id, olcum_tarihi DESC);
CREATE INDEX idx_hasta_olcum_olcek_id ON hasta_olcum USING btree (olcek_tanimi_id);
CREATE INDEX idx_egzersiz_kutuphanesi_klinik_id ON egzersiz_kutuphanesi USING btree (klinik_id);
CREATE INDEX idx_ev_egzersiz_programi_klinik_id ON ev_egzersiz_programi USING btree (klinik_id);
CREATE INDEX idx_ev_egzersiz_programi_hasta_id ON ev_egzersiz_programi USING btree (hasta_id);
CREATE INDEX idx_ev_egzersiz_kalemi_program_id ON ev_egzersiz_kalemi USING btree (program_id);
CREATE INDEX idx_ev_egzersiz_kalemi_egzersiz_id ON ev_egzersiz_kalemi USING btree (egzersiz_id);
CREATE INDEX idx_ev_egzersiz_takip_klinik_id ON ev_egzersiz_takip USING btree (klinik_id);
CREATE INDEX idx_ev_egzersiz_takip_program_id ON ev_egzersiz_takip USING btree (program_id);
CREATE INDEX idx_seans_checklist_sablonu_klinik_id ON seans_checklist_sablonu USING btree (klinik_id);
CREATE INDEX idx_randevu_checklist_klinik_id ON randevu_checklist USING btree (klinik_id);
CREATE INDEX idx_randevu_checklist_randevu_id ON randevu_checklist USING btree (randevu_id);
CREATE INDEX idx_hasta_iletisim_log_klinik_id ON hasta_iletisim_log USING btree (klinik_id);
CREATE INDEX idx_hasta_iletisim_log_hasta_id ON hasta_iletisim_log USING btree (hasta_id, olusturma_tarihi DESC);
CREATE INDEX idx_hasta_anket_klinik_id ON hasta_anket USING btree (klinik_id);
CREATE INDEX idx_hasta_anket_hasta_id ON hasta_anket USING btree (hasta_id);
CREATE INDEX idx_randevu_on_form_klinik_id ON randevu_on_form USING btree (klinik_id);
CREATE INDEX idx_hasta_iliski_klinik_id ON hasta_iliski USING btree (klinik_id);
CREATE INDEX idx_hasta_iliski_hasta_id ON hasta_iliski USING btree (hasta_id);
CREATE INDEX idx_hasta_sigorta_klinik_id ON hasta_sigorta USING btree (klinik_id);
CREATE INDEX idx_hasta_sigorta_hasta_id ON hasta_sigorta USING btree (hasta_id);
CREATE INDEX idx_hasta_belge_klinik_id ON hasta_belge USING btree (klinik_id);
CREATE INDEX idx_hasta_belge_hasta_id ON hasta_belge USING btree (hasta_id);
CREATE INDEX idx_hasta_onam_klinik_id ON hasta_onam USING btree (klinik_id);
CREATE INDEX idx_hasta_onam_hasta_id ON hasta_onam USING btree (hasta_id);
CREATE UNIQUE INDEX idx_mv_hasta_ilerleme_id ON mv_hasta_ilerleme USING btree (id);
CREATE INDEX idx_mv_hasta_ilerleme_hasta_id ON mv_hasta_ilerleme USING btree (hasta_id, olcum_tarihi);
CREATE UNIQUE INDEX idx_hasta_belge_guncel ON hasta_belge USING btree (hasta_id, belge_turu, bolge) WHERE (is_guncel = true);
CREATE INDEX idx_hasta_belge_kategori ON hasta_belge USING btree (kategori);
CREATE INDEX idx_hasta_belge_karsilastirma_grubu ON hasta_belge USING btree (karsilastirma_grubu_id) WHERE (karsilastirma_grubu_id IS NOT NULL);
CREATE INDEX idx_hasta_vucut_haritasi_isareti_klinik_id ON hasta_vucut_haritasi_isareti USING btree (klinik_id);
CREATE INDEX idx_hasta_vucut_haritasi_isareti_hasta_id ON hasta_vucut_haritasi_isareti USING btree (hasta_id);
CREATE INDEX idx_hasta_protokol_klinik_id ON hasta_protokol USING btree (klinik_id);
CREATE INDEX idx_hasta_protokol_hasta_id ON hasta_protokol USING btree (hasta_id);
CREATE INDEX idx_hasta_belge_deleted_at ON hasta_belge USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX idx_klinik_harcama_klinik_id ON klinik_harcama USING btree (klinik_id);
CREATE INDEX idx_klinik_harcama_tarih ON klinik_harcama USING btree (tarih);
CREATE INDEX idx_klinik_harcama_kategori ON klinik_harcama USING btree (kategori);
CREATE INDEX idx_personel_acil_kisi_personel_id ON personel_acil_kisi USING btree (personel_id);
CREATE INDEX idx_hasta_bakiye_hareket_randevu_id ON hasta_bakiye_hareket USING btree (randevu_id);
CREATE INDEX idx_randevu_paket_satis_id ON randevu USING btree (paket_satis_id);
CREATE INDEX idx_tedavi_protokolu_klinik_id ON tedavi_protokolu USING btree (klinik_id);
CREATE INDEX idx_tedavi_protokolu_adimi_klinik_id ON tedavi_protokolu_adimi USING btree (klinik_id);
CREATE INDEX idx_tedavi_protokolu_adimi_protokol_id ON tedavi_protokolu_adimi USING btree (tedavi_protokolu_id);
CREATE INDEX idx_randevu_antrenor_id ON randevu USING btree (antrenor_id);
CREATE INDEX idx_randevu_tedavi_protokolu_id ON randevu USING btree (tedavi_protokolu_id);
CREATE INDEX idx_is_basvurusu_klinik_id ON is_basvurusu USING btree (klinik_id);
CREATE INDEX idx_anket_yaniti_klinik_id ON anket_yaniti USING btree (klinik_id);
CREATE INDEX idx_islem_tanimi_fiyat_gecmisi_klinik_id ON islem_tanimi_fiyat_gecmisi USING btree (klinik_id);
CREATE INDEX idx_islem_tanimi_fiyat_gecmisi_islem_id ON islem_tanimi_fiyat_gecmisi USING btree (islem_tanimi_id);
CREATE UNIQUE INDEX uq_islem_tanimi_fiyat_gecmisi_acik ON islem_tanimi_fiyat_gecmisi USING btree (islem_tanimi_id) WHERE (gecerlilik_bitis IS NULL);
CREATE INDEX idx_vardiya_turu_klinik_id ON vardiya_turu USING btree (klinik_id);
CREATE INDEX idx_personel_vardiya_atama_klinik_id ON personel_vardiya_atama USING btree (klinik_id);
CREATE INDEX idx_personel_vardiya_atama_personel_id ON personel_vardiya_atama USING btree (personel_id);
CREATE INDEX idx_personel_puantaj_donem_klinik_id ON personel_puantaj_donem USING btree (klinik_id);
CREATE INDEX idx_personel_puantaj_klinik_id ON personel_puantaj USING btree (klinik_id);
CREATE INDEX idx_personel_puantaj_personel_id ON personel_puantaj USING btree (personel_id);
CREATE INDEX idx_personel_puantaj_tarih ON personel_puantaj USING btree (tarih);
CREATE INDEX idx_randevu_terapist_id_baslangic ON randevu USING btree (terapist_id, baslangic);
CREATE INDEX idx_hasta_ad_soyad_trgm ON hasta USING gin (ad_soyad gin_trgm_ops);
CREATE INDEX idx_hasta_telefon_trgm ON hasta USING gin (telefon gin_trgm_ops);
CREATE INDEX idx_personel_ucret_klinik_id ON personel_ucret USING btree (klinik_id);
CREATE INDEX idx_personel_ucret_personel_id ON personel_ucret USING btree (personel_id);
CREATE INDEX idx_personel_ucret_gecerlilik_tarihi ON personel_ucret USING btree (gecerlilik_tarihi);
CREATE INDEX idx_klinik_arac_klinik_id ON klinik_arac USING btree (klinik_id);
CREATE INDEX idx_kamusal_odeme_klinik_id ON kamusal_odeme USING btree (klinik_id);
CREATE INDEX idx_kamusal_odeme_donem ON kamusal_odeme USING btree (klinik_id, donem_yil, donem_ay);
CREATE INDEX idx_kamusal_odeme_arac_id ON kamusal_odeme USING btree (arac_id);
CREATE INDEX idx_is_basvurusu_durum ON is_basvurusu USING btree (klinik_id, durum);
CREATE INDEX idx_seans_degerlendirme_klinik_id ON seans_degerlendirme USING btree (klinik_id);
CREATE INDEX idx_seans_degerlendirme_hasta_id ON seans_degerlendirme USING btree (hasta_id);
CREATE INDEX idx_randevu_talebi_klinik_id ON randevu_talebi USING btree (klinik_id);
CREATE INDEX idx_randevu_talebi_hasta_id ON randevu_talebi USING btree (hasta_id);
CREATE INDEX idx_destek_talebi_klinik_id ON destek_talebi USING btree (klinik_id);
CREATE INDEX idx_destek_talebi_kullanici_id ON destek_talebi USING btree (kullanici_id);
CREATE INDEX idx_mesaj_kurallari_klinik ON mesaj_kurallari USING btree (klinik_id);
CREATE INDEX idx_mesaj_kuyrugu_durum_planlanan ON mesaj_kuyrugu USING btree (durum, planlanan_zaman);
CREATE INDEX idx_mesaj_kuyrugu_klinik_created ON mesaj_kuyrugu USING btree (klinik_id, created_at DESC);
CREATE INDEX idx_mesaj_kredileri_klinik ON mesaj_kredileri USING btree (klinik_id);
CREATE INDEX idx_mesaj_kredi_hareketleri_klinik_kanal ON mesaj_kredi_hareketleri USING btree (klinik_id, kanal, created_at DESC);
CREATE INDEX idx_hasta_anamnez_hasta_id ON hasta_anamnez USING btree (hasta_id);
CREATE INDEX idx_hasta_anamnez_klinik_id ON hasta_anamnez USING btree (klinik_id);
CREATE INDEX idx_resmi_tatil_tarih ON resmi_tatil USING btree (tarih);
CREATE INDEX idx_personel_izin_talebi_klinik_durum ON personel_izin_talebi USING btree (klinik_id, durum);
CREATE INDEX idx_personel_izin_talebi_personel ON personel_izin_talebi USING btree (personel_id, durum);
CREATE INDEX idx_personel_izin_talebi_tarih_araligi ON personel_izin_talebi USING btree (klinik_id, baslangic_tarih, bitis_tarih);
CREATE INDEX idx_personel_puantaj_izin_talep_id ON personel_puantaj USING btree (izin_talep_id) WHERE (izin_talep_id IS NOT NULL);
CREATE INDEX idx_personel_hesap_hareket_klinik_id ON personel_hesap_hareket USING btree (klinik_id);
CREATE INDEX idx_personel_hesap_hareket_personel_tarih ON personel_hesap_hareket USING btree (personel_id, tarih);
CREATE INDEX idx_personel_hesap_hareket_kaynak_id ON personel_hesap_hareket USING btree (kaynak_id) WHERE (kaynak_id IS NOT NULL);
CREATE UNIQUE INDEX idx_personel_hesap_hareket_hakedis_tekil ON personel_hesap_hareket USING btree (kaynak_id) WHERE (tur = 'hakedis'::text);
CREATE INDEX idx_pozisyonlar_klinik ON pozisyonlar USING btree (klinik_id);
CREATE INDEX idx_klinik_banka_hesaplari_klinik_id ON klinik_banka_hesaplari USING btree (klinik_id);
CREATE INDEX idx_nakit_banka_hareketi_klinik_id ON nakit_banka_hareketi USING btree (klinik_id);
CREATE INDEX idx_nakit_banka_hareketi_kaynak_banka ON nakit_banka_hareketi USING btree (kaynak_banka_hesap_id) WHERE (kaynak_banka_hesap_id IS NOT NULL);
CREATE INDEX idx_nakit_banka_hareketi_hedef_banka ON nakit_banka_hareketi USING btree (hedef_banka_hesap_id) WHERE (hedef_banka_hesap_id IS NOT NULL);
CREATE INDEX idx_personel_egitim_personel_id ON personel_egitim USING btree (personel_id);
CREATE INDEX idx_hasta_yorum_hasta_id ON hasta_yorum USING btree (hasta_id);
CREATE INDEX idx_hasta_yorum_klinik_id ON hasta_yorum USING btree (klinik_id);
CREATE INDEX idx_hasta_yorum_randevu_id ON hasta_yorum USING btree (randevu_id);
CREATE UNIQUE INDEX idx_kullanici_telefon_normalize ON kullanici USING btree (telefon_normalize(telefon)) WHERE (telefon_normalize(telefon) IS NOT NULL);
CREATE INDEX idx_islem_tanimi_adim_klinik_id ON islem_tanimi_adim USING btree (klinik_id);
CREATE INDEX idx_islem_tanimi_adim_islem_id ON islem_tanimi_adim USING btree (islem_tanimi_id);
CREATE INDEX idx_islem_tanimi_adim_uygulayici_pozisyon_id ON islem_tanimi_adim USING btree (uygulayici_pozisyon_id);
CREATE INDEX idx_islem_adimi_sablonu_klinik_id ON islem_adimi_sablonu USING btree (klinik_id);
CREATE INDEX idx_islem_adimi_sablonu_gerekli_cihaz_id ON islem_adimi_sablonu USING btree (gerekli_cihaz_id);
CREATE INDEX idx_hasta_bakiye_hareket_klinik_tur_created ON hasta_bakiye_hareket USING btree (klinik_id, tur, created_at DESC);
CREATE INDEX hiz_siniri_sayac_pencere_idx ON hiz_siniri_sayac USING btree (pencere_baslangic);
CREATE INDEX idx_audit_log_klinik_tarih ON ONLY public.audit_log USING btree (klinik_id, created_at DESC);
CREATE INDEX idx_randevu_cihaz_rezervasyon_randevu_id ON randevu_cihaz_rezervasyon USING btree (randevu_id);
CREATE INDEX idx_randevu_cihaz_rezervasyon_klinik_id ON randevu_cihaz_rezervasyon USING btree (klinik_id);
CREATE INDEX idx_kasa_dengeleme_klinik_created ON kasa_dengeleme USING btree (klinik_id, created_at);
CREATE INDEX idx_klinik_harcama_klinik_tarih ON klinik_harcama USING btree (klinik_id, tarih);
CREATE INDEX idx_personel_hesap_hareket_klinik_tarih ON personel_hesap_hareket USING btree (klinik_id, tarih);
CREATE INDEX idx_nakit_banka_hareketi_klinik_tarih ON nakit_banka_hareketi USING btree (klinik_id, tarih);
CREATE INDEX idx_randevu_klinik_baslangic ON randevu USING btree (klinik_id, baslangic);
CREATE INDEX idx_kamusal_odeme_klinik_odeme_tarihi ON kamusal_odeme USING btree (klinik_id, odeme_tarihi) WHERE (odeme_tarihi IS NOT NULL);
CREATE INDEX idx_hasta_ad_arama_trgm ON hasta USING gin (turkce_arama_metni(ad_soyad) gin_trgm_ops);
CREATE INDEX idx_klinik_kredi_kartlari_klinik_id ON klinik_kredi_kartlari USING btree (klinik_id);
CREATE INDEX idx_klinik_harcama_tedarikci ON klinik_harcama USING btree (klinik_id, tedarikci_anahtari(tedarikci_adi)) WHERE (tedarikci_adi IS NOT NULL);
CREATE INDEX idx_klinik_harcama_kredi_karti ON klinik_harcama USING btree (kredi_karti_id) WHERE (kredi_karti_id IS NOT NULL);
CREATE INDEX idx_klinik_cari_odeme_klinik_tarih ON klinik_cari_odeme USING btree (klinik_id, tarih);
CREATE INDEX idx_klinik_cari_odeme_tedarikci ON klinik_cari_odeme USING btree (klinik_id, tedarikci_anahtari(tedarikci_adi));
CREATE INDEX idx_klinik_cari_odeme_kredi_karti ON klinik_cari_odeme USING btree (kredi_karti_id) WHERE (kredi_karti_id IS NOT NULL);
CREATE INDEX idx_klinik_kredi_karti_odeme_klinik_tarih ON klinik_kredi_karti_odeme USING btree (klinik_id, tarih);
CREATE INDEX idx_klinik_kredi_karti_odeme_kart ON klinik_kredi_karti_odeme USING btree (kredi_karti_id);
CREATE INDEX idx_hasta_bakiye_hareket_banka_hesap ON hasta_bakiye_hareket USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);
CREATE INDEX idx_klinik_harcama_banka_hesap ON klinik_harcama USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);
CREATE INDEX idx_personel_hesap_hareket_banka_hesap ON personel_hesap_hareket USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);
CREATE INDEX idx_klinik_cari_odeme_banka_hesap ON klinik_cari_odeme USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);
CREATE INDEX idx_klinik_kredi_karti_odeme_banka_hesap ON klinik_kredi_karti_odeme USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);
CREATE INDEX idx_resmi_tatil_oneri_klinik_yil ON resmi_tatil_oneri USING btree (klinik_id, yil, bayram);
CREATE INDEX idx_kamusal_odeme_banka_hesap ON kamusal_odeme USING btree (banka_hesap_id) WHERE (banka_hesap_id IS NOT NULL);

-- ===== Tetikleyiciler =====
CREATE TRIGGER trg_klinik_updated_at BEFORE UPDATE ON klinik FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kullanici_updated_at BEFORE UPDATE ON kullanici FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_updated_at BEFORE UPDATE ON personel FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_terapist_updated_at BEFORE UPDATE ON terapist FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_updated_at BEFORE UPDATE ON hasta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_oda_updated_at BEFORE UPDATE ON oda FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cihaz_updated_at BEFORE UPDATE ON cihaz FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_randevu_updated_at BEFORE UPDATE ON randevu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_klinik_ayarlar_updated_at BEFORE UPDATE ON klinik_ayarlar FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_islem_kategori_updated_at BEFORE UPDATE ON islem_kategori FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_islem_tanimi_updated_at BEFORE UPDATE ON islem_tanimi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_paket_updated_at BEFORE UPDATE ON paket FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_paket_satis_updated_at BEFORE UPDATE ON paket_satis FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_odeme_updated_at BEFORE UPDATE ON odeme FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fatura_updated_at BEFORE UPDATE ON fatura FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_kullanici_updated_at BEFORE UPDATE ON hasta_kullanici FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_randevu_iptal_talebi_klinik_id BEFORE INSERT ON randevu_iptal_talebi FOR EACH ROW EXECUTE FUNCTION randevu_iptal_talebi_klinik_id_ata();
CREATE TRIGGER trg_hasta_hassas_updated_at BEFORE UPDATE ON hasta_hassas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_klinik_muhasebe_entegrasyonu_updated_at BEFORE UPDATE ON klinik_muhasebe_entegrasyonu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_terapist_risk_kisitla BEFORE UPDATE ON hasta FOR EACH ROW EXECUTE FUNCTION hasta_terapist_sadece_risk_guncelle();
CREATE TRIGGER trg_hasta_risk_audit AFTER UPDATE ON hasta FOR EACH ROW WHEN ((old.risk_bayraklari IS DISTINCT FROM new.risk_bayraklari)) EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_islem_kontrendikasyon_klinik_id BEFORE INSERT ON islem_kontrendikasyon FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('islem_tanimi', 'islem_tanimi_id');
CREATE TRIGGER trg_hasta_hedef_audit AFTER INSERT OR DELETE OR UPDATE ON hasta_hedef FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_hasta_olcum_audit AFTER INSERT OR DELETE OR UPDATE ON hasta_olcum FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_ev_egzersiz_takip_klinik_id BEFORE INSERT ON ev_egzersiz_takip FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('ev_egzersiz_programi', 'program_id');
CREATE TRIGGER trg_ev_egzersiz_takip_audit AFTER INSERT OR DELETE OR UPDATE ON ev_egzersiz_takip FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_randevu_checklist_klinik_id BEFORE INSERT ON randevu_checklist FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('randevu', 'randevu_id');
CREATE TRIGGER trg_1_randevu_on_form_klinik_id BEFORE INSERT ON randevu_on_form FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('randevu', 'randevu_id');
CREATE TRIGGER trg_2_randevu_on_form_dogrula BEFORE INSERT OR UPDATE ON randevu_on_form FOR EACH ROW EXECUTE FUNCTION randevu_on_form_dogrula();
CREATE TRIGGER trg_randevu_on_form_audit AFTER INSERT OR DELETE OR UPDATE ON randevu_on_form FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_2_hasta_iliski_dogrula BEFORE INSERT OR UPDATE ON hasta_iliski FOR EACH ROW EXECUTE FUNCTION hasta_iliski_klinik_dogrula();
CREATE TRIGGER trg_hasta_belge_audit AFTER INSERT OR DELETE OR UPDATE ON hasta_belge FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_hasta_onam_audit AFTER INSERT ON hasta_onam FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_islem_kontrendikasyon_updated_at BEFORE UPDATE ON islem_kontrendikasyon FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_hedef_updated_at BEFORE UPDATE ON hasta_hedef FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_olcek_tanimi_updated_at BEFORE UPDATE ON olcek_tanimi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_egzersiz_kutuphanesi_updated_at BEFORE UPDATE ON egzersiz_kutuphanesi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ev_egzersiz_programi_updated_at BEFORE UPDATE ON ev_egzersiz_programi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ev_egzersiz_kalemi_updated_at BEFORE UPDATE ON ev_egzersiz_kalemi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ev_egzersiz_takip_updated_at BEFORE UPDATE ON ev_egzersiz_takip FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_seans_checklist_sablonu_updated_at BEFORE UPDATE ON seans_checklist_sablonu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_randevu_checklist_updated_at BEFORE UPDATE ON randevu_checklist FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_anket_updated_at BEFORE UPDATE ON hasta_anket FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_iliski_updated_at BEFORE UPDATE ON hasta_iliski FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_sigorta_updated_at BEFORE UPDATE ON hasta_sigorta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_belge_updated_at BEFORE UPDATE ON hasta_belge FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_belge_onam_dogrula BEFORE INSERT OR UPDATE ON hasta_belge FOR EACH ROW EXECUTE FUNCTION hasta_belge_onam_dogrula();
CREATE TRIGGER trg_hasta_vucut_haritasi_isareti_updated_at BEFORE UPDATE ON hasta_vucut_haritasi_isareti FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_protokol_kontrendikasyon BEFORE INSERT OR UPDATE OF islem_tanimi_id, uyari_onaylandi_mi ON hasta_protokol FOR EACH ROW EXECUTE FUNCTION hasta_protokol_kontrendikasyon_kontrol();
CREATE TRIGGER trg_hasta_protokol_updated_at BEFORE UPDATE ON hasta_protokol FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_protokol_audit AFTER INSERT OR DELETE OR UPDATE ON hasta_protokol FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_klinik_harcama_updated_at BEFORE UPDATE ON klinik_harcama FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ev_egzersiz_programi_klinik_id BEFORE INSERT ON ev_egzersiz_programi FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_anket_klinik_id BEFORE INSERT ON hasta_anket FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_belge_klinik_id BEFORE INSERT ON hasta_belge FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_hedef_klinik_id BEFORE INSERT ON hasta_hedef FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_iletisim_log_klinik_id BEFORE INSERT ON hasta_iletisim_log FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_1_hasta_iliski_klinik_id BEFORE INSERT ON hasta_iliski FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_olcum_klinik_id BEFORE INSERT ON hasta_olcum FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_onam_klinik_id BEFORE INSERT ON hasta_onam FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_protokol_klinik_id BEFORE INSERT ON hasta_protokol FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_sigorta_klinik_id BEFORE INSERT ON hasta_sigorta FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_vucut_haritasi_isareti_klinik_id BEFORE INSERT ON hasta_vucut_haritasi_isareti FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_personel_acil_kisi_updated_at BEFORE UPDATE ON personel_acil_kisi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_hassas_updated_at BEFORE UPDATE ON personel_hassas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_mesleki_belge_updated_at BEFORE UPDATE ON personel_mesleki_belge FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_hassas_terapist_kisitla BEFORE UPDATE ON hasta_hassas FOR EACH ROW EXECUTE FUNCTION hasta_hassas_terapist_sadece_anamnez_guncelle();
CREATE TRIGGER trg_hasta_hassas_terapist_ekleme_kisitla BEFORE INSERT ON hasta_hassas FOR EACH ROW EXECUTE FUNCTION hasta_hassas_terapist_sadece_anamnez_ekle();
CREATE TRIGGER trg_tedavi_protokolu_updated_at BEFORE UPDATE ON tedavi_protokolu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tedavi_protokolu_adimi_klinik_id BEFORE INSERT ON tedavi_protokolu_adimi FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('tedavi_protokolu', 'tedavi_protokolu_id');
CREATE TRIGGER trg_is_basvurusu_updated_at BEFORE UPDATE ON is_basvurusu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_islem_tanimi_fiyat_gecmisi_insert AFTER INSERT ON islem_tanimi FOR EACH ROW EXECUTE FUNCTION islem_tanimi_fiyat_gecmisi_yaz();
CREATE TRIGGER trg_islem_tanimi_fiyat_gecmisi_update AFTER UPDATE ON islem_tanimi FOR EACH ROW WHEN (((old.vita_fiyat IS DISTINCT FROM new.vita_fiyat) OR (old.plus_fiyat IS DISTINCT FROM new.plus_fiyat) OR (old.elit_fiyat IS DISTINCT FROM new.elit_fiyat) OR (old.prime_fiyat IS DISTINCT FROM new.prime_fiyat) OR (old.kdv_orani IS DISTINCT FROM new.kdv_orani))) EXECUTE FUNCTION islem_tanimi_fiyat_gecmisi_yaz();
CREATE TRIGGER trg_iskonto_oranlari_updated_at BEFORE UPDATE ON iskonto_oranlari FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vardiya_turu_updated_at BEFORE UPDATE ON vardiya_turu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_vardiya_atama_klinik_id BEFORE INSERT ON personel_vardiya_atama FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');
CREATE TRIGGER trg_personel_vardiya_atama_updated_at BEFORE UPDATE ON personel_vardiya_atama FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_vardiya_atama_audit AFTER INSERT OR DELETE OR UPDATE ON personel_vardiya_atama FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_personel_puantaj_donem_klinik_id BEFORE INSERT ON personel_puantaj_donem FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');
CREATE TRIGGER trg_personel_puantaj_donem_updated_at BEFORE UPDATE ON personel_puantaj_donem FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_puantaj_donem_audit AFTER INSERT OR DELETE OR UPDATE ON personel_puantaj_donem FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_personel_puantaj_klinik_id BEFORE INSERT ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');
CREATE TRIGGER trg_personel_puantaj_varsayilanlar BEFORE INSERT ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION personel_puantaj_varsayilanlari_doldur();
CREATE TRIGGER trg_personel_puantaj_fm_onay_denetim BEFORE UPDATE ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION personel_puantaj_fm_onay_denetim();
CREATE TRIGGER trg_personel_puantaj_updated_at BEFORE UPDATE ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_puantaj_audit AFTER INSERT OR DELETE OR UPDATE ON personel_puantaj FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_kamusal_odeme_updated_at BEFORE UPDATE ON kamusal_odeme FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_seans_degerlendirme_alanlari_doldur BEFORE INSERT ON seans_degerlendirme FOR EACH ROW EXECUTE FUNCTION seans_degerlendirme_alanlari_doldur();
CREATE TRIGGER trg_randevu_talebi_klinik_id BEFORE INSERT ON randevu_talebi FOR EACH ROW EXECUTE FUNCTION randevu_talebi_klinik_id_ata();
CREATE TRIGGER trg_mesaj_kurallari_updated_at BEFORE UPDATE ON mesaj_kurallari FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mesaj_kredileri_updated_at BEFORE UPDATE ON mesaj_kredileri FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_anamnez_klinik_id BEFORE INSERT ON hasta_anamnez FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('hasta', 'hasta_id');
CREATE TRIGGER trg_hasta_anamnez_denetim BEFORE INSERT OR UPDATE ON hasta_anamnez FOR EACH ROW EXECUTE FUNCTION hasta_hassas_denetim_bilgisi_ata();
CREATE TRIGGER trg_hasta_anamnez_updated_at BEFORE UPDATE ON hasta_anamnez FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_anamnez_audit AFTER INSERT OR DELETE OR UPDATE ON hasta_anamnez FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_personel_izin_talebi_klinik_id BEFORE INSERT ON personel_izin_talebi FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');
CREATE TRIGGER trg_personel_izin_talebi_updated_at BEFORE UPDATE ON personel_izin_talebi FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_izin_talebi_audit AFTER INSERT OR DELETE OR UPDATE ON personel_izin_talebi FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_personel_hesap_hareket_klinik_id BEFORE INSERT ON personel_hesap_hareket FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id');
CREATE TRIGGER trg_personel_hesap_hareket_updated_at BEFORE UPDATE ON personel_hesap_hareket FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_personel_hesap_hareket_audit AFTER INSERT OR DELETE OR UPDATE ON personel_hesap_hareket FOR EACH ROW EXECUTE FUNCTION audit_log_yaz();
CREATE TRIGGER trg_pozisyonlar_updated_at BEFORE UPDATE ON pozisyonlar FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pozisyon_pasif_engelle BEFORE UPDATE ON pozisyonlar FOR EACH ROW EXECUTE FUNCTION pozisyon_pasif_engelle();
CREATE TRIGGER trg_klinik_pozisyonlari_seed AFTER INSERT ON klinik FOR EACH ROW EXECUTE FUNCTION klinik_pozisyonlari_seed();
CREATE TRIGGER trg_klinik_banka_hesaplari_updated_at BEFORE UPDATE ON klinik_banka_hesaplari FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_klinik_qr_kisa_kod BEFORE INSERT ON klinik FOR EACH ROW EXECUTE FUNCTION klinik_qr_kisa_kod_varsayilan();
CREATE TRIGGER trg_personel_egitim_updated_at BEFORE UPDATE ON personel_egitim FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_yorum_alanlari_doldur BEFORE INSERT ON hasta_yorum FOR EACH ROW EXECUTE FUNCTION hasta_yorum_alanlari_doldur();
CREATE TRIGGER trg_islem_tanimi_adim_updated_at BEFORE UPDATE ON islem_tanimi_adim FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_islem_tanimi_adim_klinik_id BEFORE INSERT ON islem_tanimi_adim FOR EACH ROW EXECUTE FUNCTION derive_klinik_id_from_parent('islem_tanimi', 'islem_tanimi_id');
CREATE TRIGGER trg_islem_tanimi_adim_toplam_sure AFTER INSERT OR DELETE OR UPDATE ON islem_tanimi_adim FOR EACH ROW EXECUTE FUNCTION islem_tanimi_toplam_sure_guncelle();
CREATE TRIGGER trg_islem_adimi_sablonu_updated_at BEFORE UPDATE ON islem_adimi_sablonu FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hasta_bakiye_hareket_denetim AFTER INSERT OR DELETE OR UPDATE ON hasta_bakiye_hareket FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_fatura_denetim AFTER INSERT OR DELETE OR UPDATE ON fatura FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_klinik_harcama_denetim AFTER INSERT OR DELETE OR UPDATE ON klinik_harcama FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_kamusal_odeme_denetim AFTER INSERT OR DELETE OR UPDATE ON kamusal_odeme FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_nakit_banka_hareketi_denetim AFTER INSERT OR DELETE OR UPDATE ON nakit_banka_hareketi FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_paket_satis_denetim AFTER INSERT OR DELETE OR UPDATE ON paket_satis FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_hasta_denetim AFTER INSERT OR DELETE OR UPDATE ON hasta FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_hasta_hassas_denetim AFTER INSERT OR DELETE OR UPDATE ON hasta_hassas FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz('sadece_alan_adi');
CREATE TRIGGER trg_hasta_vucut_haritasi_isareti_denetim AFTER INSERT OR DELETE OR UPDATE ON hasta_vucut_haritasi_isareti FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_randevu_cihaz_rezervasyon_ekle AFTER INSERT ON randevu FOR EACH ROW EXECUTE FUNCTION randevu_cihaz_rezervasyon_tetikle();
CREATE TRIGGER trg_randevu_cihaz_rezervasyon_guncelle AFTER UPDATE ON randevu FOR EACH ROW WHEN (((old.baslangic IS DISTINCT FROM new.baslangic) OR (old.bitis IS DISTINCT FROM new.bitis) OR (old.islem_tanimi_id IS DISTINCT FROM new.islem_tanimi_id) OR (old.cihaz_id IS DISTINCT FROM new.cihaz_id) OR ((old.durum = ANY (ARRAY['iptal'::randevu_durum_tipi, 'gelmedi'::randevu_durum_tipi])) IS DISTINCT FROM (new.durum = ANY (ARRAY['iptal'::randevu_durum_tipi, 'gelmedi'::randevu_durum_tipi]))))) EXECUTE FUNCTION randevu_cihaz_rezervasyon_tetikle();
CREATE TRIGGER trg_kasa_dengeleme_denetim AFTER INSERT OR DELETE OR UPDATE ON kasa_dengeleme FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_randevu_iptal_talebi_gec_iptal BEFORE INSERT ON randevu_iptal_talebi FOR EACH ROW EXECUTE FUNCTION randevu_iptal_talebi_gec_iptal_ata();
CREATE TRIGGER trg_klinik_kredi_kartlari_updated_at BEFORE UPDATE ON klinik_kredi_kartlari FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_zz_hasta_bakiye_hareket_kredi_karti BEFORE INSERT ON hasta_bakiye_hareket FOR EACH ROW EXECUTE FUNCTION hasta_bakiye_hareket_kredi_karti_ayari();
CREATE TRIGGER trg_klinik_cari_odeme_denetim AFTER INSERT OR DELETE OR UPDATE ON klinik_cari_odeme FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_klinik_kredi_karti_odeme_denetim AFTER INSERT OR DELETE OR UPDATE ON klinik_kredi_karti_odeme FOR EACH ROW EXECUTE FUNCTION audit_log_degisiklik_yaz();
CREATE TRIGGER trg_klinik_harcama_cari_butunluk BEFORE DELETE OR UPDATE ON klinik_harcama FOR EACH ROW EXECUTE FUNCTION klinik_harcama_cari_butunluk();
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON hasta_bakiye_hareket FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_yontemi', 'banka_havalesi', 'banka_hesap_id');
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON klinik_harcama FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON personel_hesap_hareket FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON klinik_cari_odeme FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON klinik_kredi_karti_odeme FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_tipi', 'havale', 'banka_hesap_id');
CREATE TRIGGER trg_banka_hesabi_silme_engeli BEFORE DELETE ON klinik_banka_hesaplari FOR EACH ROW EXECUTE FUNCTION banka_hesabi_silme_engeli();
CREATE TRIGGER trg_zzz_banka_hesabi_butunluk BEFORE INSERT OR UPDATE ON kamusal_odeme FOR EACH ROW EXECUTE FUNCTION banka_hesabi_butunluk('odeme_yontemi', 'havale', 'banka_hesap_id');
CREATE TRIGGER trg_nakit_banka_hareketi_hesap_butunluk BEFORE INSERT OR UPDATE OF kaynak_banka_hesap_id, hedef_banka_hesap_id, klinik_id ON nakit_banka_hareketi FOR EACH ROW EXECUTE FUNCTION nakit_banka_hareketi_hesap_butunluk();
CREATE TRIGGER trg_zz_hasta_portal_alan_kisitla BEFORE UPDATE ON hasta FOR EACH ROW EXECUTE FUNCTION hasta_portal_alan_kisitla();
CREATE TRIGGER trg_hasta_hassas_klinik_id BEFORE INSERT OR UPDATE OF klinik_id, hasta_id ON hasta_hassas FOR EACH ROW EXECUTE FUNCTION hasta_hassas_klinik_id_ata();
CREATE TRIGGER trg_personel_hesap_hareket_tutar_yuvarla BEFORE INSERT OR UPDATE OF tutar ON personel_hesap_hareket FOR EACH ROW EXECUTE FUNCTION personel_hesap_hareket_tutar_yuvarla();

-- ===== Satır düzeyi güvenlik =====
ALTER TABLE klinik ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik FORCE ROW LEVEL SECURITY;
ALTER TABLE kullanici ENABLE ROW LEVEL SECURITY;
ALTER TABLE kullanici FORCE ROW LEVEL SECURITY;
ALTER TABLE personel ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel FORCE ROW LEVEL SECURITY;
ALTER TABLE terapist ENABLE ROW LEVEL SECURITY;
ALTER TABLE terapist FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta FORCE ROW LEVEL SECURITY;
ALTER TABLE oda ENABLE ROW LEVEL SECURITY;
ALTER TABLE oda FORCE ROW LEVEL SECURITY;
ALTER TABLE cihaz ENABLE ROW LEVEL SECURITY;
ALTER TABLE cihaz FORCE ROW LEVEL SECURITY;
ALTER TABLE randevu ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_ayarlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_ayarlar FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_kategori ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_kategori FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi FORCE ROW LEVEL SECURITY;
ALTER TABLE paket ENABLE ROW LEVEL SECURITY;
ALTER TABLE paket FORCE ROW LEVEL SECURITY;
ALTER TABLE odeme ENABLE ROW LEVEL SECURITY;
ALTER TABLE odeme FORCE ROW LEVEL SECURITY;
ALTER TABLE paket_satis ENABLE ROW LEVEL SECURITY;
ALTER TABLE paket_satis FORCE ROW LEVEL SECURITY;
ALTER TABLE odeme_kalemi ENABLE ROW LEVEL SECURITY;
ALTER TABLE odeme_satiri ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_bakiye_hareket ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_bakiye_hareket FORCE ROW LEVEL SECURITY;
ALTER TABLE fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE fatura FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_kullanici ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_iptal_talebi ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_iptal_talebi FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_hassas ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_hassas FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_muhasebe_entegrasyonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_muhasebe_entegrasyonu FORCE ROW LEVEL SECURITY;
ALTER TABLE periyodik_randevu ENABLE ROW LEVEL SECURITY;
ALTER TABLE periyodik_randevu FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_kontrendikasyon ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_kontrendikasyon FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_hedef ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_hedef FORCE ROW LEVEL SECURITY;
ALTER TABLE olcek_tanimi ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_olcum ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_olcum FORCE ROW LEVEL SECURITY;
ALTER TABLE egzersiz_kutuphanesi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_egzersiz_programi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_egzersiz_programi FORCE ROW LEVEL SECURITY;
ALTER TABLE ev_egzersiz_kalemi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_egzersiz_takip ENABLE ROW LEVEL SECURITY;
ALTER TABLE ev_egzersiz_takip FORCE ROW LEVEL SECURITY;
ALTER TABLE seans_checklist_sablonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE seans_checklist_sablonu FORCE ROW LEVEL SECURITY;
ALTER TABLE randevu_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_checklist FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_iletisim_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_iletisim_log FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_anket ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_anket FORCE ROW LEVEL SECURITY;
ALTER TABLE randevu_on_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_on_form FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_iliski ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_iliski FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_sigorta ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_sigorta FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_belge ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_belge FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_onam ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_onam FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_vucut_haritasi_isareti ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_vucut_haritasi_isareti FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_protokol ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_protokol FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_harcama ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_harcama FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_hassas ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_acil_kisi ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_mesleki_belge ENABLE ROW LEVEL SECURITY;
ALTER TABLE tedavi_protokolu ENABLE ROW LEVEL SECURITY;
ALTER TABLE tedavi_protokolu FORCE ROW LEVEL SECURITY;
ALTER TABLE tedavi_protokolu_adimi ENABLE ROW LEVEL SECURITY;
ALTER TABLE tedavi_protokolu_adimi FORCE ROW LEVEL SECURITY;
ALTER TABLE is_basvurusu ENABLE ROW LEVEL SECURITY;
ALTER TABLE is_basvurusu FORCE ROW LEVEL SECURITY;
ALTER TABLE anket_yaniti ENABLE ROW LEVEL SECURITY;
ALTER TABLE anket_yaniti FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi_fiyat_gecmisi ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi_fiyat_gecmisi FORCE ROW LEVEL SECURITY;
ALTER TABLE iskonto_oranlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE iskonto_oranlari FORCE ROW LEVEL SECURITY;
ALTER TABLE vardiya_turu ENABLE ROW LEVEL SECURITY;
ALTER TABLE vardiya_turu FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_vardiya_atama ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_vardiya_atama FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_puantaj_donem ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_puantaj_donem FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_puantaj ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_puantaj FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_ucret ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_ucret FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_arac ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_arac FORCE ROW LEVEL SECURITY;
ALTER TABLE kamusal_odeme ENABLE ROW LEVEL SECURITY;
ALTER TABLE kamusal_odeme FORCE ROW LEVEL SECURITY;
ALTER TABLE seans_degerlendirme ENABLE ROW LEVEL SECURITY;
ALTER TABLE seans_degerlendirme FORCE ROW LEVEL SECURITY;
ALTER TABLE randevu_talebi ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_talebi FORCE ROW LEVEL SECURITY;
ALTER TABLE destek_talebi ENABLE ROW LEVEL SECURITY;
ALTER TABLE destek_talebi FORCE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kurallari ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kurallari FORCE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kuyrugu ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kuyrugu FORCE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kredileri ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kredileri FORCE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kredi_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesaj_kredi_hareketleri FORCE ROW LEVEL SECURITY;
ALTER TABLE hasta_anamnez ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_anamnez FORCE ROW LEVEL SECURITY;
ALTER TABLE resmi_tatil ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_izin_talebi ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_izin_talebi FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_hesap_hareket ENABLE ROW LEVEL SECURITY;
ALTER TABLE personel_hesap_hareket FORCE ROW LEVEL SECURITY;
ALTER TABLE pozisyon_sablonlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE pozisyonlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE pozisyonlar FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_banka_hesaplari ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_banka_hesaplari FORCE ROW LEVEL SECURITY;
ALTER TABLE nakit_banka_hareketi ENABLE ROW LEVEL SECURITY;
ALTER TABLE nakit_banka_hareketi FORCE ROW LEVEL SECURITY;
ALTER TABLE personel_egitim ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_yorum ENABLE ROW LEVEL SECURITY;
ALTER TABLE hasta_yorum FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi_adim ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_tanimi_adim FORCE ROW LEVEL SECURITY;
ALTER TABLE islem_adimi_sablonu ENABLE ROW LEVEL SECURITY;
ALTER TABLE islem_adimi_sablonu FORCE ROW LEVEL SECURITY;
ALTER TABLE hiz_siniri_sayac ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE randevu_cihaz_rezervasyon ENABLE ROW LEVEL SECURITY;
ALTER TABLE randevu_cihaz_rezervasyon FORCE ROW LEVEL SECURITY;
ALTER TABLE kasa_dengeleme ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasa_dengeleme FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_kredi_kartlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_kredi_kartlari FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_cari_odeme ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_cari_odeme FORCE ROW LEVEL SECURITY;
ALTER TABLE klinik_kredi_karti_odeme ENABLE ROW LEVEL SECURITY;
ALTER TABLE klinik_kredi_karti_odeme FORCE ROW LEVEL SECURITY;
ALTER TABLE resmi_tatil_oneri ENABLE ROW LEVEL SECURITY;
ALTER TABLE resmi_tatil_oneri FORCE ROW LEVEL SECURITY;

CREATE POLICY klinik_select_kendi ON klinik AS PERMISSIVE FOR SELECT TO PUBLIC USING (((id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_update_yetkili ON klinik AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_insert_super_admin ON klinik AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
CREATE POLICY klinik_delete_super_admin ON klinik AS PERMISSIVE FOR DELETE TO PUBLIC USING (( SELECT is_super_admin() AS is_super_admin));
CREATE POLICY kullanici_select_kendi_klinik ON kullanici AS PERMISSIVE FOR SELECT TO PUBLIC USING (((id = app_kullanici_id()) OR (klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY kullanici_update_kendi_veya_admin ON kullanici AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((id = app_kullanici_id()) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((id = app_kullanici_id()) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY kullanici_insert_admin ON kullanici AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY kullanici_delete_admin ON kullanici AS PERMISSIVE FOR DELETE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_select_klinik ON personel AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_yonet_admin ON personel AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY terapist_select_klinik ON terapist AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY terapist_yonet_admin ON terapist AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_select_klinik ON hasta AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_yonet_resepsiyon_admin ON hasta AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY oda_select_klinik ON oda AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY oda_yonet_resepsiyon_admin ON oda AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY cihaz_select_klinik ON cihaz AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY cihaz_yonet_resepsiyon_admin ON cihaz AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_select_klinik ON randevu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_insert_yetkili ON randevu AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_update_resepsiyon_admin ON randevu AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_update_terapist_kendi ON randevu AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND terapist_id_giris_yapan_kullaniciya_ait_mi(terapist_id))) WITH CHECK ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)));
CREATE POLICY randevu_delete_yetkili ON randevu AS PERMISSIVE FOR DELETE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_ayarlar_select_klinik ON klinik_ayarlar AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_ayarlar_yonet_admin ON klinik_ayarlar AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_kategori_select_klinik ON islem_kategori AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_kategori_yonet_admin ON islem_kategori AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_tanimi_select_klinik ON islem_tanimi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_tanimi_yonet_admin ON islem_tanimi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY paket_select_klinik ON paket AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY paket_yonet_admin ON paket AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_select_klinik ON odeme AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_yonet_resepsiyon_admin ON odeme AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY paket_satis_select_klinik ON paket_satis AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY paket_satis_yonet_resepsiyon_admin ON paket_satis AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_bakiye_hareket_select_klinik ON hasta_bakiye_hareket AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_bakiye_hareket_ekle_resepsiyon_admin ON hasta_bakiye_hareket AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_kalemi_select_klinik ON odeme_kalemi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_kalemi_ekle_resepsiyon_admin ON odeme_kalemi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_satiri_select_klinik ON odeme_satiri AS PERMISSIVE FOR SELECT TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY odeme_satiri_ekle_resepsiyon_admin ON odeme_satiri AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY fatura_select_klinik ON fatura AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_kullanici_select ON hasta_kullanici AS PERMISSIVE FOR SELECT TO PUBLIC USING (((id = app_kullanici_id()) OR (EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_kullanici_update_klinik ON hasta_kullanici AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((EXISTS ( SELECT 1
   FROM hasta m
  WHERE ((m.id = hasta_kullanici.hasta_id) AND (m.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_iptal_talebi_insert_portal ON randevu_iptal_talebi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) AND (EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.id = randevu_iptal_talebi.randevu_id) AND (r.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) AND (r.durum = 'planlandi'::randevu_durum_tipi))))));
CREATE POLICY randevu_iptal_talebi_select_portal ON randevu_iptal_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_iptal_talebi_select_klinik ON randevu_iptal_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_iptal_talebi_update_klinik ON randevu_iptal_talebi AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_select_portal ON hasta AS PERMISSIVE FOR SELECT TO PUBLIC USING ((id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_select_portal ON randevu AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY paket_satis_select_portal ON paket_satis AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY paket_select_portal ON paket AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM paket_satis ps
  WHERE ((ps.paket_id = paket.id) AND (ps.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY odeme_select_portal ON odeme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY odeme_kalemi_select_portal ON odeme_kalemi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_kalemi.odeme_id) AND (o.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY odeme_satiri_select_portal ON odeme_satiri AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM odeme o
  WHERE ((o.id = odeme_satiri.odeme_id) AND (o.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY hasta_bakiye_hareket_select_portal ON hasta_bakiye_hareket AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY islem_tanimi_select_portal ON islem_tanimi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (odeme_kalemi ok
     JOIN odeme o ON ((o.id = ok.odeme_id)))
  WHERE ((ok.islem_tanimi_id = islem_tanimi.id) AND (o.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY terapist_select_portal ON terapist AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.terapist_id = terapist.id) AND (r.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY personel_select_portal ON personel AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (terapist t
     JOIN randevu r ON ((r.terapist_id = t.id)))
  WHERE ((t.personel_id = personel.id) AND (r.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY oda_select_portal ON oda AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.oda_id = oda.id) AND (r.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY hasta_hassas_select ON hasta_hassas AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR (hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_update_portal ON hasta AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((id = ( SELECT current_hasta_id() AS current_hasta_id))) WITH CHECK ((id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY fatura_ekle_resepsiyon_admin ON fatura AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY fatura_guncelle_resepsiyon_admin ON fatura AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_select_admin_muhasebe ON personel AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_muhasebe_entegrasyonu_select ON klinik_muhasebe_entegrasyonu AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_muhasebe_entegrasyonu_yonet_admin ON klinik_muhasebe_entegrasyonu AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY periyodik_randevu_select_klinik ON periyodik_randevu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY periyodik_randevu_insert_yetkili ON periyodik_randevu AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY periyodik_randevu_update_resepsiyon_admin ON periyodik_randevu AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_update_terapist_risk ON hasta AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'terapist'::kullanici_rol_tipi))) WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'terapist'::kullanici_rol_tipi)));
CREATE POLICY islem_kontrendikasyon_select_klinik ON islem_kontrendikasyon AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_kontrendikasyon_yonet_admin ON islem_kontrendikasyon AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_hedef_select_klinik ON hasta_hedef AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_hedef_yonet_terapist_admin ON hasta_hedef AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY olcek_tanimi_select ON olcek_tanimi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR (klinik_id IS NULL) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY olcek_tanimi_yonet ON olcek_tanimi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_olcum_select_klinik ON hasta_olcum AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_olcum_yonet_terapist_admin ON hasta_olcum AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY egzersiz_kutuphanesi_select ON egzersiz_kutuphanesi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR (klinik_id IS NULL) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY egzersiz_kutuphanesi_yonet ON egzersiz_kutuphanesi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_programi_select_klinik ON ev_egzersiz_programi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_programi_select_portal ON ev_egzersiz_programi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY ev_egzersiz_programi_yonet_terapist_admin ON ev_egzersiz_programi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_kalemi_select_klinik ON ev_egzersiz_kalemi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_kalemi_select_portal ON ev_egzersiz_kalemi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY ev_egzersiz_kalemi_yonet_terapist_admin ON ev_egzersiz_kalemi AS PERMISSIVE FOR ALL TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_kalemi.program_id) AND (ep.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_takip_select_klinik ON ev_egzersiz_takip AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_takip_select_portal ON ev_egzersiz_takip AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY ev_egzersiz_takip_yonet_terapist_admin ON ev_egzersiz_takip AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY ev_egzersiz_takip_portal_isaretle ON ev_egzersiz_takip AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY ev_egzersiz_takip_portal_guncelle ON ev_egzersiz_takip AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ev_egzersiz_programi ep
  WHERE ((ep.id = ev_egzersiz_takip.program_id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY egzersiz_kutuphanesi_select_portal ON egzersiz_kutuphanesi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (ev_egzersiz_kalemi ek
     JOIN ev_egzersiz_programi ep ON ((ep.id = ek.program_id)))
  WHERE ((ek.egzersiz_id = egzersiz_kutuphanesi.id) AND (ep.hasta_id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY seans_checklist_sablonu_select_klinik ON seans_checklist_sablonu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY seans_checklist_sablonu_yonet_admin ON seans_checklist_sablonu AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_checklist_select_klinik ON randevu_checklist AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_checklist_yonet_admin ON randevu_checklist AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_checklist_yonet_terapist_kendi ON randevu_checklist AS PERMISSIVE FOR ALL TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.id = randevu_checklist.randevu_id) AND terapist_id_giris_yapan_kullaniciya_ait_mi(r.terapist_id)))))) WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.id = randevu_checklist.randevu_id) AND terapist_id_giris_yapan_kullaniciya_ait_mi(r.terapist_id))))));
CREATE POLICY hasta_iletisim_log_select_klinik ON hasta_iletisim_log AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_iletisim_log_ekle_klinik ON hasta_iletisim_log AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anket_select_klinik ON hasta_anket AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anket_select_portal ON hasta_anket AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY hasta_anket_ekle_klinik ON hasta_anket AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anket_portal_yanitla ON hasta_anket AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) AND (cevap_tarihi IS NULL))) WITH CHECK ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_on_form_select_klinik ON randevu_on_form AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_on_form_select_portal ON randevu_on_form AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_on_form_portal_doldur ON randevu_on_form AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_on_form_ekle_klinik ON randevu_on_form AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_iliski_select_klinik ON hasta_iliski AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_iliski_yonet_resepsiyon_admin ON hasta_iliski AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_sigorta_select ON hasta_sigorta AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_sigorta_yonet_resepsiyon_admin ON hasta_sigorta AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_belge_ekle_klinik ON hasta_belge AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_belge_sil_admin ON hasta_belge AS PERMISSIVE FOR DELETE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_onam_select_klinik ON hasta_onam AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_onam_select_portal ON hasta_onam AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY hasta_onam_ekle_klinik ON hasta_onam AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_vucut_haritasi_isareti_select_klinik ON hasta_vucut_haritasi_isareti AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_vucut_haritasi_isareti_select_portal ON hasta_vucut_haritasi_isareti AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY hasta_vucut_haritasi_isareti_yonet_terapist_admin ON hasta_vucut_haritasi_isareti AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_protokol_select_klinik ON hasta_protokol AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_protokol_select_portal ON hasta_protokol AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY hasta_protokol_yonet_terapist_admin ON hasta_protokol AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_belge_select_klinik ON hasta_belge AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (deleted_at IS NULL)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_belge_select_portal ON hasta_belge AS PERMISSIVE FOR SELECT TO PUBLIC USING (((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) AND (deleted_at IS NULL)));
CREATE POLICY hasta_belge_guncelle_klinik ON hasta_belge AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_harcama_select ON klinik_harcama AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_harcama_yonet_admin ON klinik_harcama AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_hassas_select_admin ON personel_hassas AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_hassas_upsert_admin ON personel_hassas AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_hassas_update_admin ON personel_hassas AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hassas.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_acil_kisi_select ON personel_acil_kisi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) OR (p.kullanici_id = app_kullanici_id())))))));
CREATE POLICY personel_acil_kisi_insert ON personel_acil_kisi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_acil_kisi_update ON personel_acil_kisi AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_acil_kisi_delete ON personel_acil_kisi AS PERMISSIVE FOR DELETE TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_acil_kisi.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_mesleki_belge_select ON personel_mesleki_belge AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) OR (p.kullanici_id = app_kullanici_id())))))));
CREATE POLICY personel_mesleki_belge_upsert ON personel_mesleki_belge AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY personel_mesleki_belge_update ON personel_mesleki_belge AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_mesleki_belge.personel_id) AND (p.klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))))))));
CREATE POLICY hasta_hassas_insert ON hasta_hassas AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_hassas_update ON hasta_hassas AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))) OR (hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY tedavi_protokolu_select_klinik ON tedavi_protokolu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY tedavi_protokolu_yonet_admin ON tedavi_protokolu AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY tedavi_protokolu_adimi_select_klinik ON tedavi_protokolu_adimi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY tedavi_protokolu_adimi_yonet_admin ON tedavi_protokolu_adimi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_insert_qr_kayit ON hasta AS PERMISSIVE FOR INSERT TO klinik_anonim WITH CHECK (((kayit_kanali = 'qr_self_servis'::text) AND (kvkk_onay_tarihi IS NOT NULL) AND (kvkk_onaylayan_tip = 'hasta'::text)));
CREATE POLICY is_basvurusu_select_admin ON is_basvurusu AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY is_basvurusu_update_admin ON is_basvurusu AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY anket_yaniti_insert_anon ON anket_yaniti AS PERMISSIVE FOR INSERT TO klinik_anonim WITH CHECK (true);
CREATE POLICY hasta_hassas_insert_qr_kayit ON hasta_hassas AS PERMISSIVE FOR INSERT TO klinik_anonim WITH CHECK (hasta_qr_self_servis_mi(hasta_id));
CREATE POLICY islem_tanimi_fiyat_gecmisi_select_klinik ON islem_tanimi_fiyat_gecmisi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY iskonto_oranlari_select_klinik ON iskonto_oranlari AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY iskonto_oranlari_yonet_admin ON iskonto_oranlari AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY vardiya_turu_select ON vardiya_turu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY vardiya_turu_yonet_admin ON vardiya_turu AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_vardiya_atama_select ON personel_vardiya_atama AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_vardiya_atama.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_vardiya_atama_ekle_admin ON personel_vardiya_atama AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_vardiya_atama_guncelle_admin ON personel_vardiya_atama AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_puantaj_donem_select ON personel_puantaj_donem AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_puantaj_donem.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_puantaj_select ON personel_puantaj AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'resepsiyon'::kullanici_rol_tipi) AND resepsiyon_puantaj_gorebilir_mi()) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_puantaj.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_puantaj_ekle_admin ON personel_puantaj AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND personel_puantaj_donemi_acik_mi(personel_id, tarih)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_puantaj_guncelle_admin ON personel_puantaj AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) AND personel_puantaj_donemi_acik_mi(personel_id, tarih)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_arac_select ON klinik_arac AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_arac_yonet_admin ON klinik_arac AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY kamusal_odeme_select ON kamusal_odeme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY kamusal_odeme_yonet_admin ON kamusal_odeme AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY is_basvurusu_insert_anon ON is_basvurusu AS PERMISSIVE FOR INSERT TO klinik_anonim WITH CHECK (((durum = 'beklemede'::text) AND (degerlendiren_kullanici_id IS NULL) AND (degerlendirme_tarihi IS NULL) AND (personel_id IS NULL)));
CREATE POLICY seans_degerlendirme_insert_anon ON seans_degerlendirme AS PERMISSIVE FOR INSERT TO klinik_anonim WITH CHECK (randevu_anket_uygun_mu(randevu_id));
CREATE POLICY randevu_talebi_insert_portal ON randevu_talebi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_talebi_select_portal ON randevu_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((hasta_id = ( SELECT current_hasta_id() AS current_hasta_id)));
CREATE POLICY randevu_talebi_select_klinik ON randevu_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_talebi_update_klinik ON randevu_talebi AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY islem_tanimi_select_portal_katalog ON islem_tanimi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((aktif = true) AND (klinik_id = ( SELECT hasta.klinik_id
   FROM hasta
  WHERE (hasta.id = ( SELECT current_hasta_id() AS current_hasta_id))))));
CREATE POLICY anket_yaniti_select_admin ON anket_yaniti AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY anket_yaniti_update_goruldu ON anket_yaniti AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY seans_degerlendirme_select_admin ON seans_degerlendirme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY seans_degerlendirme_update_goruldu ON seans_degerlendirme AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY destek_talebi_select ON destek_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING (((kullanici_id = app_kullanici_id()) OR ((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY destek_talebi_insert ON destek_talebi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((kullanici_id = app_kullanici_id()) AND (klinik_id = ( SELECT current_klinik_id() AS current_klinik_id))));
CREATE POLICY destek_talebi_update ON destek_talebi AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY mesaj_kurallari_select_admin ON mesaj_kurallari AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY mesaj_kurallari_yonet_admin ON mesaj_kurallari AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY mesaj_kredileri_select_admin ON mesaj_kredileri AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY mesaj_kredi_hareketleri_select_admin ON mesaj_kredi_hareketleri AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY mesaj_kuyrugu_select_admin ON mesaj_kuyrugu AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anamnez_select_klinik ON hasta_anamnez AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anamnez_ekle ON hasta_anamnez AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY hasta_anamnez_guncelle ON hasta_anamnez AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['terapist'::kullanici_rol_tipi, 'klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY resmi_tatil_select ON resmi_tatil AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id IS NULL) OR (klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY resmi_tatil_yonet_admin ON resmi_tatil AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_izin_talebi_select ON personel_izin_talebi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_izin_talebi.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_ucret_select ON personel_ucret AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_ucret.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_ucret_yonet_admin ON personel_ucret AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_hesap_hareket_select ON personel_hesap_hareket AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_hesap_hareket.personel_id) AND (p.kullanici_id = app_kullanici_id())))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY pozisyon_sablonlari_select ON pozisyon_sablonlari AS PERMISSIVE FOR SELECT TO klinik_uygulama USING (true);
CREATE POLICY pozisyonlar_select ON pozisyonlar AS PERMISSIVE FOR SELECT TO klinik_uygulama USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY pozisyonlar_insert ON pozisyonlar AS PERMISSIVE FOR INSERT TO klinik_uygulama WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) OR ( SELECT is_super_admin() AS is_super_admin))));
CREATE POLICY pozisyonlar_update ON pozisyonlar AS PERMISSIVE FOR UPDATE TO klinik_uygulama USING (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) OR ( SELECT is_super_admin() AS is_super_admin)))) WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND ((( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi) OR ( SELECT is_super_admin() AS is_super_admin))));
CREATE POLICY klinik_banka_hesaplari_select ON klinik_banka_hesaplari AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_banka_hesaplari_yonet ON klinik_banka_hesaplari AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY nakit_banka_hareketi_select ON nakit_banka_hareketi AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR is_super_admin()));
CREATE POLICY nakit_banka_hareketi_yonet_admin ON nakit_banka_hareketi AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin())) WITH CHECK ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()));
CREATE POLICY personel_egitim_select ON personel_egitim AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_egitim.personel_id) AND (p.klinik_id = current_klinik_id()) AND ((current_rol() = 'klinik_admin'::kullanici_rol_tipi) OR (p.kullanici_id = app_kullanici_id())))))));
CREATE POLICY personel_egitim_insert ON personel_egitim AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((is_super_admin() OR ((current_rol() = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_egitim.personel_id) AND (p.klinik_id = current_klinik_id())))))));
CREATE POLICY personel_egitim_update ON personel_egitim AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((is_super_admin() OR ((current_rol() = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_egitim.personel_id) AND (p.klinik_id = current_klinik_id()))))))) WITH CHECK ((is_super_admin() OR ((current_rol() = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_egitim.personel_id) AND (p.klinik_id = current_klinik_id())))))));
CREATE POLICY personel_egitim_delete ON personel_egitim AS PERMISSIVE FOR DELETE TO PUBLIC USING ((is_super_admin() OR ((current_rol() = 'klinik_admin'::kullanici_rol_tipi) AND (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_egitim.personel_id) AND (p.klinik_id = current_klinik_id())))))));
CREATE POLICY randevu_talebi_insert_klinik ON randevu_talebi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))));
CREATE POLICY randevu_iptal_talebi_insert_klinik ON randevu_iptal_talebi AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi])) AND (EXISTS ( SELECT 1
   FROM randevu r
  WHERE ((r.id = randevu_iptal_talebi.randevu_id) AND (r.hasta_id = randevu_iptal_talebi.hasta_id) AND (r.klinik_id = current_klinik_id()) AND (r.durum = 'planlandi'::randevu_durum_tipi))))));
CREATE POLICY hasta_yorum_select_klinik ON hasta_yorum AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = current_klinik_id()) OR is_super_admin()));
CREATE POLICY hasta_yorum_insert_klinik ON hasta_yorum AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((klinik_id = current_klinik_id()) AND (olusturan_kullanici_id = app_kullanici_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi, 'terapist'::kullanici_rol_tipi]))));
CREATE POLICY islem_tanimi_adim_select_klinik ON islem_tanimi_adim AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = current_klinik_id()) OR is_super_admin()));
CREATE POLICY islem_tanimi_adim_yonet_admin ON islem_tanimi_adim AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin())) WITH CHECK ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()));
CREATE POLICY islem_adimi_sablonu_select_klinik ON islem_adimi_sablonu AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = current_klinik_id()) OR is_super_admin()));
CREATE POLICY islem_adimi_sablonu_yonet_admin ON islem_adimi_sablonu AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin())) WITH CHECK ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()));
CREATE POLICY audit_log_insert_klinik ON audit_log AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY audit_log_select_admin ON audit_log AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY randevu_cihaz_rezervasyon_select_klinik ON randevu_cihaz_rezervasyon AS PERMISSIVE FOR SELECT TO PUBLIC USING (((klinik_id = current_klinik_id()) OR is_super_admin()));
CREATE POLICY kasa_dengeleme_select ON kasa_dengeleme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR is_super_admin()));
CREATE POLICY kasa_dengeleme_yonet_admin ON kasa_dengeleme AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin())) WITH CHECK ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()));
CREATE POLICY klinik_kredi_kartlari_select ON klinik_kredi_kartlari AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_kredi_kartlari_yonet ON klinik_kredi_kartlari AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY klinik_cari_odeme_select ON klinik_cari_odeme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR is_super_admin()));
CREATE POLICY klinik_kredi_karti_odeme_select ON klinik_kredi_karti_odeme AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR is_super_admin()));
CREATE POLICY klinik_cari_odeme_sil_admin ON klinik_cari_odeme AS PERMISSIVE FOR DELETE TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()));
CREATE POLICY klinik_kredi_karti_odeme_yonet_admin ON klinik_kredi_karti_odeme AS PERMISSIVE FOR ALL TO PUBLIC USING ((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin())) WITH CHECK (((((klinik_id = current_klinik_id()) AND (current_rol() = 'klinik_admin'::kullanici_rol_tipi)) OR is_super_admin()) AND (EXISTS ( SELECT 1
   FROM klinik_kredi_kartlari c
  WHERE ((c.id = klinik_kredi_karti_odeme.kredi_karti_id) AND (c.klinik_id = klinik_kredi_karti_odeme.klinik_id))))));
CREATE POLICY resmi_tatil_oneri_select ON resmi_tatil_oneri AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = 'klinik_admin'::kullanici_rol_tipi)) OR ( SELECT is_super_admin() AS is_super_admin)));
CREATE POLICY personel_maas_gecmisi_select ON personel_ucret AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((klinik_id = ( SELECT current_klinik_id() AS current_klinik_id)) AND (( SELECT current_rol() AS current_rol) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'muhasebe'::kullanici_rol_tipi]))) OR (EXISTS ( SELECT 1
   FROM personel p
  WHERE ((p.id = personel_ucret.personel_id) AND (p.kullanici_id = ( SELECT app_kullanici_id() AS uid))))) OR ( SELECT is_super_admin() AS is_super_admin)));

-- Sahip politikası: FORCE altında klinik_sahip (DEFINER fonksiyon/tetikleyici sahibi) da yalnız aktif tenant'ı görür; tenant'lar arası erişim YOK.
CREATE POLICY sahip_aktif_tenant ON klinik AS PERMISSIVE FOR ALL TO klinik_sahip USING (id = current_klinik_id()) WITH CHECK (id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON kullanici AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON terapist AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON oda AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON cihaz AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_ayarlar AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_kategori AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_tanimi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON paket AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON odeme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON paket_satis AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_bakiye_hareket AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON fatura AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu_iptal_talebi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_hassas AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_muhasebe_entegrasyonu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON periyodik_randevu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_kontrendikasyon AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_hedef AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_olcum AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON ev_egzersiz_programi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON ev_egzersiz_takip AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON seans_checklist_sablonu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu_checklist AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_iletisim_log AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_anket AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu_on_form AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_iliski AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_sigorta AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_belge AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_onam AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_vucut_haritasi_isareti AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_protokol AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_harcama AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON tedavi_protokolu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON tedavi_protokolu_adimi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON is_basvurusu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON anket_yaniti AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_tanimi_fiyat_gecmisi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON iskonto_oranlari AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON vardiya_turu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_vardiya_atama AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_puantaj_donem AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_puantaj AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_ucret AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_arac AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON kamusal_odeme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON seans_degerlendirme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu_talebi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON destek_talebi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON mesaj_kurallari AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON mesaj_kuyrugu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON mesaj_kredileri AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON mesaj_kredi_hareketleri AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_anamnez AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_izin_talebi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON personel_hesap_hareket AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON pozisyonlar AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_banka_hesaplari AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON nakit_banka_hareketi AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON hasta_yorum AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_tanimi_adim AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON islem_adimi_sablonu AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON audit_log AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON randevu_cihaz_rezervasyon AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON kasa_dengeleme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_kredi_kartlari AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_cari_odeme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON klinik_kredi_karti_odeme AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());
CREATE POLICY sahip_aktif_tenant ON resmi_tatil_oneri AS PERMISSIVE FOR ALL TO klinik_sahip USING (klinik_id = current_klinik_id()) WITH CHECK (klinik_id = current_klinik_id());

-- ===== Yetkiler =====
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON kullanici TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON terapist TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta TO klinik_uygulama;
GRANT INSERT ON hasta TO klinik_anonim;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON oda TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON cihaz TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_ayarlar TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_kategori TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_tanimi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON paket TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON odeme TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON paket_satis TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON odeme_kalemi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON odeme_satiri TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_bakiye_hareket TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON fatura TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_kullanici TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu_iptal_talebi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_hassas TO klinik_uygulama;
GRANT INSERT ON hasta_hassas TO klinik_anonim;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_muhasebe_entegrasyonu TO klinik_uygulama;
GRANT SELECT (klinik_id, parasut_client_id, parasut_company_id, baglanti_durumu, created_at, updated_at) ON klinik_muhasebe_entegrasyonu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON periyodik_randevu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_kontrendikasyon TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_hedef TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON olcek_tanimi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_olcum TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON egzersiz_kutuphanesi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ev_egzersiz_programi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ev_egzersiz_kalemi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ev_egzersiz_takip TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON seans_checklist_sablonu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu_checklist TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_iletisim_log TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_anket TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu_on_form TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_iliski TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_sigorta TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_belge TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_onam TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_vucut_haritasi_isareti TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_protokol TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_harcama TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_hassas TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_acil_kisi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_mesleki_belge TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON tedavi_protokolu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON tedavi_protokolu_adimi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON is_basvurusu TO klinik_uygulama;
GRANT INSERT ON is_basvurusu TO klinik_anonim;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON anket_yaniti TO klinik_uygulama;
GRANT INSERT ON anket_yaniti TO klinik_anonim;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_tanimi_fiyat_gecmisi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON iskonto_oranlari TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON vardiya_turu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_vardiya_atama TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_puantaj_donem TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_puantaj TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_ucret TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_arac TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON kamusal_odeme TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON seans_degerlendirme TO klinik_uygulama;
GRANT INSERT ON seans_degerlendirme TO klinik_anonim;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu_talebi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON destek_talebi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON mesaj_kurallari TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON mesaj_kuyrugu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON mesaj_kredileri TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON mesaj_kredi_hareketleri TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_anamnez TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON resmi_tatil TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_izin_talebi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_hesap_hareket TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON pozisyon_sablonlari TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON pozisyonlar TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_banka_hesaplari TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON nakit_banka_hareketi TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON personel_egitim TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON hasta_yorum TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_tanimi_adim TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON islem_adimi_sablonu TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON audit_log TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON randevu_cihaz_rezervasyon TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON kasa_dengeleme TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_kredi_kartlari TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_cari_odeme TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON klinik_kredi_karti_odeme TO klinik_uygulama;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON resmi_tatil_oneri TO klinik_uygulama;
GRANT INSERT ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT SELECT ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT UPDATE ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT DELETE ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT TRUNCATE ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT REFERENCES ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT TRIGGER ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT MAINTAIN ON klinik_kredi_karti_hareketleri TO klinik_uygulama;
GRANT INSERT ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT SELECT ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT UPDATE ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT DELETE ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT TRUNCATE ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT REFERENCES ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT TRIGGER ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT MAINTAIN ON v_hasta_cari_ozet TO klinik_uygulama;
GRANT INSERT ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT SELECT ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT UPDATE ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT DELETE ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT TRUNCATE ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT REFERENCES ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT TRIGGER ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT MAINTAIN ON v_hasta_detay_ozet TO klinik_uygulama;
GRANT INSERT ON v_hasta_ilerleme TO klinik_uygulama;
GRANT SELECT ON v_hasta_ilerleme TO klinik_uygulama;
GRANT UPDATE ON v_hasta_ilerleme TO klinik_uygulama;
GRANT DELETE ON v_hasta_ilerleme TO klinik_uygulama;
GRANT TRUNCATE ON v_hasta_ilerleme TO klinik_uygulama;
GRANT REFERENCES ON v_hasta_ilerleme TO klinik_uygulama;
GRANT TRIGGER ON v_hasta_ilerleme TO klinik_uygulama;
GRANT MAINTAIN ON v_hasta_ilerleme TO klinik_uygulama;
GRANT INSERT ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT SELECT ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT UPDATE ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT DELETE ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT TRUNCATE ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT REFERENCES ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT TRIGGER ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT MAINTAIN ON v_hasta_karsilastirma TO klinik_uygulama;
GRANT INSERT ON v_hasta_ozet TO klinik_uygulama;
GRANT SELECT ON v_hasta_ozet TO klinik_uygulama;
GRANT UPDATE ON v_hasta_ozet TO klinik_uygulama;
GRANT DELETE ON v_hasta_ozet TO klinik_uygulama;
GRANT TRUNCATE ON v_hasta_ozet TO klinik_uygulama;
GRANT REFERENCES ON v_hasta_ozet TO klinik_uygulama;
GRANT TRIGGER ON v_hasta_ozet TO klinik_uygulama;
GRANT MAINTAIN ON v_hasta_ozet TO klinik_uygulama;
GRANT INSERT ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT SELECT ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT UPDATE ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT DELETE ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT TRUNCATE ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT REFERENCES ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT TRIGGER ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT MAINTAIN ON v_personel_bilgi_durumu TO klinik_uygulama;
GRANT INSERT ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT SELECT ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT UPDATE ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT DELETE ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT TRUNCATE ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT REFERENCES ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT TRIGGER ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT MAINTAIN ON v_personel_hesap_bakiye TO klinik_uygulama;
GRANT INSERT ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT SELECT ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT UPDATE ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT DELETE ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT TRUNCATE ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT REFERENCES ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT TRIGGER ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT MAINTAIN ON v_personel_izin_bakiye TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION set_updated_at() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION portal_giris_epostasi(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_iptal_talebi_klinik_id_ata() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_hassas_klinik_id_ata() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION derive_klinik_id_from_parent() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION audit_log_yaz() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_terapist_sadece_risk_guncelle() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_on_form_dogrula() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_iliski_klinik_dogrula() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_belge_onam_dogrula() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_belge_goruntule(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_protokol_kontrendikasyon_kontrol() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION odeme_olustur(uuid,numeric,boolean,text,jsonb,jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_hassas_kaydet(uuid,text,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_hassas_maskeli_getir(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_hassas_terapist_sadece_anamnez_guncelle() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_hassas_terapist_sadece_anamnez_ekle() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_hassas_denetim_bilgisi_ata() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_gelis_isaretle(uuid,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_arsiv_ice_aktar(jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_arsiv_ice_aktar(jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_bakiye_hareket_arsiv_ekle(jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION paket_satis_arsiv_ekle(uuid,jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_qr_self_servis_mi(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_qr_self_servis_mi(uuid) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION islem_tanimi_fiyat_gecmisi_yaz() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION islem_tanimi_etkin_fiyat(uuid,uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION resepsiyon_puantaj_gorebilir_mi() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_planlanan_getir(uuid,date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_net_dakika(timestamp with time zone,timestamp with time zone,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_planlanan_dakika(time without time zone,time without time zone) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_sapma_dakika(timestamp with time zone,timestamp with time zone,integer,time without time zone,time without time zone) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_varsayilanlari_doldur() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_fm_onay_denetim() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_donemi_acik_mi(uuid,date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_donem_kapat(uuid,integer,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_puantaj_donem_yeniden_ac(uuid,integer,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION seans_degerlendirme_alanlari_doldur() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_anket_uygun_mu(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_anket_uygun_mu(uuid) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION seans_degerlendirme_baglam_getir(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION seans_degerlendirme_baglam_getir(uuid) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION qr_kodu_aktif_mi(uuid,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION qr_kodu_aktif_mi(uuid,text) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION randevu_talebi_klinik_id_ata() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_bakiye_hareket_borc_duzenle(uuid,numeric,boolean,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION mesaj_kredi_yukle(uuid,mesaj_kanal_tipi,integer,numeric,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION mesaj_kredi_senkronla(uuid,mesaj_kanal_tipi,integer,bigint) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_hak_gun_hesapla(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_is_gunu_sayisi(date,date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_cakisanlari_getir(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_talep_olustur(uuid,text,date,date,text,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_talep_iptal_et(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_talebi_onayla(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_talebi_reddet(uuid,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_izin_talebi_yonetici_iptal(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_hesap_hareket_donem_ekle(uuid,numeric,numeric) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION pozisyon_pasif_engelle() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_pozisyonlari_seed() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_qr_kisa_kod_uret() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_qr_kisa_kod_varsayilan() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_qr_bilgisi_getir(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_qr_bilgisi_getir(text) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION personel_hesap_hareket_ekle(uuid,text,numeric,date,text,text,uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION terapist_id_giris_yapan_kullaniciya_ait_mi(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_yorum_alanlari_doldur() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION telefon_normalize(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_giris_epostasi(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION kasa_bakiye_once_toplam(date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION banka_bakiye_once_toplam_tumu(date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION kredi_karti_bakiye_once_toplam(date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION islem_tanimi_toplam_sure_guncelle() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION islem_tanimi_kaydet(uuid,text,numeric,numeric,numeric,numeric,numeric,text,jsonb) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_seans_bedelini_isle(uuid,numeric,text,uuid,text,timestamp with time zone,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION audit_log_degisiklik_yaz() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hiz_siniri_kullan(text,integer,integer,boolean) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hiz_siniri_kullan(text,integer,integer,boolean) TO klinik_anonim;
GRANT EXECUTE ON FUNCTION audit_log_bolum_olustur(integer,date) TO bakim_rolu;
GRANT EXECUTE ON FUNCTION personel_puantaj_kendi_kaydet(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION rapor_donem_ozeti(timestamp with time zone,timestamp with time zone,date,date) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION rapor_yillik_ozet(integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION turkce_arama_metni(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_ara(text,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION gelmeme_analizi(timestamp with time zone,timestamp with time zone) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_iptal_talebi_gec_iptal_ata() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_iptal_geri_al(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_iptal_et(uuid,text,boolean,boolean) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_bakiye_hareket_kredi_karti_ayari() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION tedarikci_anahtari(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_cari_bakiyeler(uuid,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_cari_odeme_ekle(text,numeric,date,text,uuid,uuid,text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION klinik_harcama_cari_butunluk() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION kredi_karti_borc_ozetleri(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION resmi_tatil_onerisi_karar(integer,text,boolean,date[]) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION turkce_kucuk_harf(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION turkce_sira_anahtari(text) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_bas_harf_sayilari() TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION hasta_harf_listesi(text,integer,integer) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION randevu_gelmedi_isaretle(uuid) TO klinik_uygulama;
GRANT EXECUTE ON FUNCTION personel_hesap_hareket_tutar_yuvarla() TO klinik_uygulama;
