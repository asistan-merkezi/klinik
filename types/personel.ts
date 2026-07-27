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
};

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
