export type KimlikNoTipi = "tc" | "pasaport";

export type MusteriHassasSatir = {
  musteri_id: string;
  kimlik_no: string | null;
  kimlik_no_tipi: KimlikNoTipi | null;
  adres: string | null;
  acil_durum_ad_soyad: string | null;
  acil_durum_yakinlik: string | null;
  acil_durum_telefon: string | null;
  kronik_hastaliklar: string | null;
  surekli_ilaclar: string | null;
  alerjiler: string | null;
  gecirilmis_ameliyatlar: string | null;
  gelis_sebebi: string | null;
  kan_sulandirici_kullanimi: boolean;
};
