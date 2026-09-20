import type { KullaniciRol } from "./personel";

export type UcretTipi = "aylik_maas" | "prim_usulu";
export type PuantajModu = "gunluk" | "esnek" | "takipsiz";

export const UCRET_TIPI_SECENEKLERI: { value: UcretTipi; label: string }[] = [
  { value: "aylik_maas", label: "Aylık Maaş" },
  { value: "prim_usulu", label: "Prim Usulü" },
];

export const PUANTAJ_MODU_SECENEKLERI: { value: PuantajModu; label: string }[] = [
  { value: "gunluk", label: "Günlük (giriş/çıkış)" },
  { value: "esnek", label: "Esnek (saat takibi yok)" },
  { value: "takipsiz", label: "Takipsiz" },
];

export type Pozisyon = {
  id: string;
  ad: string;
  grup: string;
  sira: number;
  aktif: boolean;
  sistem_erisimi: boolean;
  varsayilan_rol: KullaniciRol;
  ucret_tipi: UcretTipi;
  puantaj_modu: PuantajModu;
  ozel_mi: boolean;
};
