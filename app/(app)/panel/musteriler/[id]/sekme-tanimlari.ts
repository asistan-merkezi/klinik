export type SekmeAnahtari =
  | "genel"
  | "randevu"
  | "tedavi"
  | "gelisim"
  | "cari"
  | "belgeler"
  | "iletisim";

export const SEKMELER: { deger: SekmeAnahtari; etiket: string; terapisteKapali?: boolean }[] = [
  { deger: "genel", etiket: "Genel Bilgiler" },
  { deger: "randevu", etiket: "Randevu & Seans" },
  { deger: "tedavi", etiket: "Tedavi & Anamnez" },
  { deger: "gelisim", etiket: "Gelişim & Ölçümler" },
  { deger: "cari", etiket: "Cari & Ödeme", terapisteKapali: true },
  { deger: "belgeler", etiket: "Belgeler & Medya" },
  { deger: "iletisim", etiket: "İletişim & Bildirimler" },
];
