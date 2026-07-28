export type IslemTanimiSatir = {
  id: string;
  ad: string;
  fiyat: number;
  kdv_orani: number;
  muhasebe_hizmet_ismi: string | null;
  aktif: boolean;
  cihaz: { ad: string } | null;
};
