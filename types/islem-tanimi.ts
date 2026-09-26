export type IslemTanimiAdimSatir = {
  id: string;
  ad: string;
  sure_dakika: number | null;
  gerekli_cihaz_id: string | null;
  cihaz: { ad: string } | null;
};

export type IslemTanimiSatir = {
  id: string;
  ad: string;
  vita_fiyat: number;
  plus_fiyat: number | null;
  elit_fiyat: number | null;
  prime_fiyat: number | null;
  kdv_orani: number;
  muhasebe_hizmet_ismi: string | null;
  sure_dakika: number | null;
  aktif: boolean;
  adimlar: IslemTanimiAdimSatir[];
};
