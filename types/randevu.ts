export type RandevuDurum = "planlandi" | "geldi" | "gecikmeli_geldi" | "gelmedi" | "ertelendi" | "iptal";

export type RandevuSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurum;
  gecikme_dakika?: number | null;
  hasta: { ad_soyad: string } | null;
  oda: { ad: string } | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
  created_at?: string;
  olusturan_kullanici?: { ad_soyad: string } | null;
  hasta_id?: string;
  terapist_id?: string;
  oda_id?: string;
  cihaz_id?: string | null;
  islem_tanimi?: { id: string; ad: string } | null;
};

export type SecenekSatir = {
  id: string;
  ad: string;
};
