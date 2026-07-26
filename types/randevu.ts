export type RandevuDurum = "planlandi" | "geldi" | "iptal" | "gelmedi";

export type RandevuSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurum;
  musteri: { ad_soyad: string } | null;
  oda: { ad: string } | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
};

export type SecenekSatir = {
  id: string;
  ad: string;
};
