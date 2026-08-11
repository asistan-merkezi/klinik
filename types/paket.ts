import type { HastaKategori } from "./hasta";

export type SatisHastaSecenegi = {
  id: string;
  ad: string;
  kategori: HastaKategori;
};

export type PaketSatir = {
  id: string;
  ad: string;
  seans_sayisi: number;
  satis_bitis_tarihi: string | null;
  fiyat: number;
  kdv_orani: number;
  aktif: boolean;
  tekrar_sayisi: number;
  kisi_kotasi: number | null;
  islem_tanimi: { ad: string } | null;
};

export type PaketKatilimciSatir = {
  paket_satis_id: string;
  hasta_id: string;
  ad_soyad: string;
  kategori: HastaKategori;
  kalan_adet: number;
  durum: string;
};
