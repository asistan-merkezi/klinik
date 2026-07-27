import type { RandevuDurum } from "./randevu";

export type IptalTalebiDurum = "bekliyor" | "onaylandi" | "reddedildi";

export type PortalRandevuSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurum;
  terapist: { personel: { ad_soyad: string } | null } | null;
  oda: { ad: string } | null;
  randevu_iptal_talebi: { id: string; durum: IptalTalebiDurum } | null;
};

export type BekleyenIptalTalebiSatir = {
  id: string;
  durum: IptalTalebiDurum;
  created_at: string;
  randevu: {
    id: string;
    baslangic: string;
    durum: RandevuDurum;
    musteri: { ad_soyad: string } | null;
  } | null;
};
