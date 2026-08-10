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
    hasta: { ad_soyad: string } | null;
  } | null;
};

export type RandevuTalebiDurum = "bekliyor" | "onaylandi" | "reddedildi";

/** Portal'da hastanın kendi randevu taleplerini listelemesi için. */
export type PortalRandevuTalebiSatir = {
  id: string;
  islem_tanimi: { ad: string } | null;
  tercih_tarih: string;
  tercih_saat: string | null;
  not_metni: string | null;
  durum: RandevuTalebiDurum;
  created_at: string;
};

/** Panelde "Bekleyen Randevu Talepleri" kartı için. */
export type BekleyenRandevuTalebiSatir = {
  id: string;
  hasta_id: string;
  islem_tanimi_id: string;
  tercih_tarih: string;
  tercih_saat: string | null;
  not_metni: string | null;
  created_at: string;
  hasta: { ad_soyad: string } | null;
  islem_tanimi: { ad: string } | null;
};
