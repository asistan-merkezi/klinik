export type RandevuDurum = "planlandi" | "geldi" | "iptal" | "gelmedi";

export type RandevuSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurum;
  musteri: { ad_soyad: string } | null;
  oda: { ad: string } | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
  created_at?: string;
  olusturan_kullanici?: { ad_soyad: string } | null;
  musteri_id?: string;
  terapist_id?: string;
  oda_id?: string;
  cihaz_id?: string | null;
  islem_tanimi?: { id: string; ad: string } | null;
};

export type SecenekSatir = {
  id: string;
  ad: string;
};
