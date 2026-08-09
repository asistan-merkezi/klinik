export type OdemeTipi =
  | "kdv"
  | "stopaj_muhtasar"
  | "sgk_primleri"
  | "damga_vergisi"
  | "emlak_vergisi"
  | "motorlu_tasitlar_vergisi"
  | "bagkur_primleri"
  | "muhasebe_ucreti"
  | "trafik_cezasi"
  | "gec_odeme_faizi"
  | "gecici_vergi"
  | "kurumlar_vergisi";

export const ODEME_TIPI_SECENEKLERI: { value: OdemeTipi; label: string }[] = [
  { value: "kdv", label: "KDV" },
  { value: "stopaj_muhtasar", label: "Stopaj (Muhtasar)" },
  { value: "sgk_primleri", label: "SGK Primleri" },
  { value: "damga_vergisi", label: "Damga Vergisi" },
  { value: "emlak_vergisi", label: "Emlak Vergisi" },
  { value: "motorlu_tasitlar_vergisi", label: "Motorlu Taşıtlar Vergisi" },
  { value: "bagkur_primleri", label: "Bağkur Primleri" },
  { value: "muhasebe_ucreti", label: "Muhasebe Ücreti" },
  { value: "trafik_cezasi", label: "Trafik Cezası" },
  { value: "gec_odeme_faizi", label: "Geç Ödeme Faizi" },
  { value: "gecici_vergi", label: "Geçici Vergi" },
  { value: "kurumlar_vergisi", label: "Kurumlar Vergisi" },
];

export const ODEME_TIPI_ETIKET = Object.fromEntries(
  ODEME_TIPI_SECENEKLERI.map((s) => [s.value, s.label])
) as Record<OdemeTipi, string>;

export const DONEM_AY_SECENEKLERI: { value: number; label: string }[] = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
].map((label, i) => ({ value: i + 1, label }));

export type KamusalOdemeDurum = "odendi" | "bekliyor" | "gecikti";

export type KamusalOdemeSatir = {
  id: string;
  odeme_tipi: OdemeTipi;
  tutar: number;
  donem_ay: number;
  donem_yil: number;
  vade_tarihi: string;
  odeme_tarihi: string | null;
  notlar: string | null;
};

/** `bugun` "yyyy-MM-dd" formatında (bkz. lib/datetime.ts bugunIstanbulTarihi) — date string karşılaştırması için. */
export function kamusalOdemeDurumHesapla(
  satir: { odeme_tarihi: string | null; vade_tarihi: string },
  bugun: string
): KamusalOdemeDurum {
  if (satir.odeme_tarihi) return "odendi";
  return satir.vade_tarihi < bugun ? "gecikti" : "bekliyor";
}

export const DURUM_ETIKET: Record<KamusalOdemeDurum, string> = {
  odendi: "Ödendi",
  bekliyor: "Bekliyor",
  gecikti: "Gecikti",
};
