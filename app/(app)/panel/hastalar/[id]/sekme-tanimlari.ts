export type SekmeAnahtari = "kisisel" | "randevu" | "tedavi" | "cari";

export const SEKMELER: { deger: SekmeAnahtari; etiket: string; terapisteKapali?: boolean }[] = [
  { deger: "kisisel", etiket: "Kişisel Bilgiler" },
  { deger: "randevu", etiket: "Randevu & Seans" },
  { deger: "tedavi", etiket: "Tedavi & Anamnez" },
  { deger: "cari", etiket: "Cari & Ödeme", terapisteKapali: true },
];
