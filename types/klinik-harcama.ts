export type HarcamaKategori = "kira" | "fatura" | "malzeme" | "bakim_hizmet" | "diger";

export const HARCAMA_KATEGORI_SECENEKLERI: { value: HarcamaKategori; label: string }[] = [
  { value: "kira", label: "Kira" },
  { value: "fatura", label: "Fatura (Elektrik/Su/İnternet)" },
  { value: "malzeme", label: "Sarf Malzeme" },
  { value: "bakim_hizmet", label: "Bakım & Hizmet" },
  { value: "diger", label: "Diğer" },
];

export const HARCAMA_KATEGORI_ETIKET = Object.fromEntries(
  HARCAMA_KATEGORI_SECENEKLERI.map((s) => [s.value, s.label])
) as Record<HarcamaKategori, string>;

/** Bu kategoride ilişkili araç seçimi (opsiyonel) gösterilir — klinik_arac'tan beslenir. */
export const ARAC_GOSTERILEN_KATEGORILER: HarcamaKategori[] = ["bakim_hizmet"];

export type OdemeTipi = "nakit" | "havale" | "kredi_karti";

export const ODEME_TIPI_SECENEKLERI: { value: OdemeTipi; label: string }[] = [
  { value: "nakit", label: "Nakit" },
  { value: "havale", label: "Havale" },
  { value: "kredi_karti", label: "Kredi Kartı" },
];

export const ODEME_TIPI_ETIKET = Object.fromEntries(
  ODEME_TIPI_SECENEKLERI.map((s) => [s.value, s.label])
) as Record<OdemeTipi, string>;

export type KlinikHarcamaSatir = {
  id: string;
  tarih: string;
  tutar: number;
  kategori: HarcamaKategori;
  aciklama: string | null;
  tedarikci_adi: string | null;
  arac_id: string | null;
  odeme_tipi: OdemeTipi | null;
  banka_hesap_id: string | null;
  is_faturali: boolean;
  fatura_no: string | null;
};
