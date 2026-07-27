export type IslemTanimiSatir = {
  id: string;
  ad: string;
  fiyat: number;
  kdv_orani: number;
  parasut_hizmet_kodu: string | null;
  aktif: boolean;
  islem_kategori: { ad: string } | null;
  cihaz: { ad: string } | null;
};
