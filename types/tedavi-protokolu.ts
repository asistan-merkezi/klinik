export type TedaviProtokoluAdimSatir = {
  id: string;
  sira: number;
  adim_notu: string | null;
  islem_tanimi: { id: string; ad: string } | null;
};

export type TedaviProtokoluSatir = {
  id: string;
  ad: string;
  aciklama: string | null;
  aktif: boolean;
  tedavi_protokolu_adimi: TedaviProtokoluAdimSatir[];
};
