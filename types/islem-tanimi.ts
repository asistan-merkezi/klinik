export type IslemTanimiSatir = {
  id: string;
  ad: string;
  vita_fiyat: number;
  plus_fiyat: number | null;
  elit_fiyat: number | null;
  prime_fiyat: number | null;
  kdv_orani: number;
  muhasebe_hizmet_ismi: string | null;
  aktif: boolean;
  cihaz: { ad: string } | null;
};
