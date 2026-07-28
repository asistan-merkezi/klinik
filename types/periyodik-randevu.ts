export type HaftaninGunu = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Pazar..6=Cumartesi (JS Date.getDay() ile aynı)

export const HAFTANIN_GUNLERI: { value: string; label: string }[] = [
  { value: "1", label: "Pazartesi" },
  { value: "2", label: "Salı" },
  { value: "3", label: "Çarşamba" },
  { value: "4", label: "Perşembe" },
  { value: "5", label: "Cuma" },
  { value: "6", label: "Cumartesi" },
  { value: "0", label: "Pazar" },
];

export const GUN_ETIKETI: Record<HaftaninGunu, string> = {
  0: "Pazar",
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
};

export type PeriyodikRandevuSatir = {
  id: string;
  haftanin_gunu: HaftaninGunu;
  saat: string;
  sure_dakika: number;
  durum: "aktif" | "iptal";
  bitis_tarihi: string | null;
  otomatik_yenile: boolean;
  terapist: { personel: { ad_soyad: string } | null } | null;
  oda: { ad: string } | null;
  islem_tanimi: { ad: string } | null;
};
