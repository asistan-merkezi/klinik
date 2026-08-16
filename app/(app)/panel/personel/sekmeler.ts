export type PersonelSekme = "pozisyonlar" | "liste" | "hesap" | "puantaj";

export type PersonelSekmeTanimi = {
  key: PersonelSekme;
  label: string;
  roller: "hepsi" | readonly string[];
};

// Sıra, sekme çubuğunda görünecek sırayla birebir aynı.
export const PERSONEL_SEKME_TANIMLARI: readonly PersonelSekmeTanimi[] = [
  { key: "pozisyonlar", label: "Pozisyonlar", roller: ["klinik_admin"] },
  { key: "liste", label: "Liste", roller: "hepsi" },
  { key: "hesap", label: "Hesap", roller: ["klinik_admin", "muhasebe"] },
  { key: "puantaj", label: "Puantaj", roller: "hepsi" },
] as const;

export function personelSekmeErisimVarMi(tanim: PersonelSekmeTanimi, rol: string | null): boolean {
  return tanim.roller === "hepsi" || tanim.roller.includes(rol ?? "");
}
