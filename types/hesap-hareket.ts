export type HesapHareketTuru = "hakedis" | "prim" | "yol" | "yemek" | "mesai" | "avans" | "kesinti" | "odeme";

/** Manuel ekleme formunda gösterilecek türler — 'hakedis' SADECE dönem kapanışında otomatik yazılır, elle eklenemez. */
export type ManuelHesapHareketTuru = Exclude<HesapHareketTuru, "hakedis">;

export const HESAP_HAREKET_TUR_ETIKETLERI: Record<HesapHareketTuru, string> = {
  hakedis: "Hakediş (Taban)",
  prim: "Prim",
  yol: "Yol",
  yemek: "Yemek",
  mesai: "Fazla Mesai",
  avans: "Avans",
  kesinti: "Kesinti",
  odeme: "Ödeme",
};

/** + turler bakiyeyi artırır (personelin alacağı), − turler azaltır (borç kapatma). */
export const HESAP_HAREKET_YONU: Record<HesapHareketTuru, 1 | -1> = {
  hakedis: 1,
  prim: 1,
  yol: 1,
  yemek: 1,
  mesai: 1,
  avans: -1,
  kesinti: -1,
  odeme: -1,
};

export const MANUEL_HESAP_HAREKET_SECENEKLERI: { value: ManuelHesapHareketTuru; label: string }[] = [
  { value: "prim", label: HESAP_HAREKET_TUR_ETIKETLERI.prim },
  { value: "yol", label: HESAP_HAREKET_TUR_ETIKETLERI.yol },
  { value: "yemek", label: HESAP_HAREKET_TUR_ETIKETLERI.yemek },
  { value: "mesai", label: HESAP_HAREKET_TUR_ETIKETLERI.mesai },
  { value: "avans", label: HESAP_HAREKET_TUR_ETIKETLERI.avans },
  { value: "kesinti", label: HESAP_HAREKET_TUR_ETIKETLERI.kesinti },
  { value: "odeme", label: HESAP_HAREKET_TUR_ETIKETLERI.odeme },
];

export type HesapHareket = {
  id: string;
  personel_id: string;
  tur: HesapHareketTuru;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  kaynak_id: string | null;
  created_at: string;
};

export type HesapBakiye = {
  personel_id: string;
  klinik_id: string;
  toplam_hakedis: number;
  toplam_odenen: number;
  bakiye: number;
};
