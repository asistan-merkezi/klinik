export type PaketSatir = {
  id: string;
  ad: string;
  seans_sayisi: number;
  gecerlilik_gun: number;
  fiyat: number;
  kdv_orani: number;
  aktif: boolean;
  islem_tanimi: { ad: string } | null;
};
