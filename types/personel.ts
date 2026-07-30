export type MaasHesaplamaModeli = "sabit" | "islem_basi_prim" | "barajli_prim";
export type HakedisTuru = "yol" | "yemek" | "mesai" | "diger";

export type PersonelSatir = {
  id: string;
  ad_soyad: string;
  gorev: string;
  maas: number | null;
  aktif: boolean;
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
};

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
