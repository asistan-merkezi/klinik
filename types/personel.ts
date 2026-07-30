import type { Cinsiyet } from "./hasta";

export type MaasHesaplamaModeli = "sabit" | "islem_basi_prim" | "barajli_prim";
export type HakedisTuru = "yol" | "yemek" | "mesai" | "diger";
export type CalismaTipi = "tam_zamanli" | "yari_zamanli" | "vardiyali" | "prim_usulu";

export const CALISMA_TIPI_SECENEKLERI: { value: CalismaTipi; label: string }[] = [
  { value: "tam_zamanli", label: "Tam Zamanlı" },
  { value: "yari_zamanli", label: "Yarı Zamanlı" },
  { value: "vardiyali", label: "Vardiyalı" },
  { value: "prim_usulu", label: "Prim Usulü" },
];

export const CINSIYET_SECENEKLERI: { value: Cinsiyet; label: string }[] = [
  { value: "kadin", label: "Kadın" },
  { value: "erkek", label: "Erkek" },
  { value: "belirtilmemis", label: "Belirtilmemiş" },
];

export type PersonelSatir = {
  id: string;
  ad_soyad: string;
  gorev: string;
  maas: number | null;
  aktif: boolean;
  kullanici: { telefon: string | null } | null;
};

export type PersonelDetay = {
  id: string;
  ad_soyad: string;
  gorev: string;
  maas: number | null;
  aktif: boolean;
  kullanici_id: string | null;
  tc_kimlik_no: string | null;
  uzmanlik_tescil_no: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adres: string | null;
  dogum_tarihi: string | null;
  dogum_yeri: string | null;
  cinsiyet: Cinsiyet | null;
  eposta: string | null;
  departman: string | null;
  calisma_tipi: CalismaTipi | null;
  sgk_sicil_no: string | null;
  ise_giris_tarihi: string | null;
  ise_baslama_notu: string | null;
  kullanici: { telefon: string | null; rol: KullaniciRol } | null;
};

export type PersonelAcilKisi = {
  id: string;
  ad_soyad: string;
  yakinlik: string;
  telefon: string;
};

export type PersonelMeslekiBelge = {
  diploma_no: string | null;
  uzmanlik_belge_no: string | null;
  meslek_odasi_sicil_no: string | null;
  saglik_bakanligi_tescil_no: string | null;
  e_imza_sertifika_seri_no: string | null;
  e_imza_gecerlilik_tarihi: string | null;
  kase_gorsel_url: string | null;
  mali_sorumluluk_sigorta_police_no: string | null;
  mali_sorumluluk_sigorta_bitis_tarihi: string | null;
};

export type PersonelHassasMaskeli = {
  tc_kimlik_var: boolean;
  tc_kimlik_son2: string | null;
  pasaport_var: boolean;
  pasaport_son2: string | null;
  anahtar_kurulu: boolean;
};

// Not: "super_admin" bilinçli olarak burada YOK — platform yöneticisi rolü
// (klinik_id'si olmayan, tüm kliniklere erişen tek rol) kişi bazlı, klinik
// içi personel formundan atanabilir olursa klinik_admin kendini/başkasını
// platform admin'e yükseltebilir (kiralık/multi-tenant güvenlik açığı).
export type KullaniciRol = "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe";

export const ROL_SECENEKLERI: { value: KullaniciRol; label: string }[] = [
  { value: "klinik_admin", label: "Klinik Yöneticisi" },
  { value: "resepsiyon", label: "Resepsiyon / Banko" },
  { value: "terapist", label: "Terapist" },
  { value: "muhasebe", label: "Muhasebe / Finans" },
];

export type TerapistAyarlari = {
  id: string;
  maas_hesaplama_modeli: MaasHesaplamaModeli;
  prim_sabit_tutar: number | null;
  baraj_seans_sayisi: number | null;
  baraj_bonus_tutari: number | null;
};

export type HakedisSatir = {
  id: string;
  tur: HakedisTuru;
  tutar: number;
  tarih: string;
  aciklama: string | null;
};
