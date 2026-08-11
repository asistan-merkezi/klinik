export type PaketSatir = {
  id: string;
  ad: string;
  seans_sayisi: number;
  satis_bitis_tarihi: string | null;
  fiyat: number;
  kdv_orani: number;
  aktif: boolean;
  islem_tanimi: { ad: string } | null;
};
