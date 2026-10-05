/**
 * Gelmeme (no-show) analizi — `gelmeme_analizi` RPC'sinin (migration
 * 20261005160000) satırlarını sayfanın kullandığı şekle çevirir. Oran tanımı
 * TEK yerde: gelmedi / (gerçekleşen + gelmedi). İptal ve erteleme paydaya
 * GİRMEZ (hasta önceden haber vermiş demektir, gelmeme değildir); saati geçip
 * sonucu girilmemiş ('planlandi') randevular da girmez — ayrıca gösterilir,
 * çünkü yüksekse oran güvenilmez.
 */

export type GelmemeBoyutu = "toplam" | "terapist" | "saat" | "gun" | "ay" | "hasta";

export type GelmemeRpcSatiri = {
  boyut: GelmemeBoyutu;
  anahtar: string;
  etiket: string;
  gerceklesen: number;
  gelmedi: number;
  gecikmeli: number;
  iptal: number;
  ertelendi: number;
  isaretlenmemis: number;
};

export type GelmemeSatiri = GelmemeRpcSatiri & {
  /** Oran paydası: gerçekleşen + gelmedi. */
  sonuclanan: number;
  /** 0-1; payda 0 ise null. */
  gelmemeOrani: number | null;
  /** Geç gelen / gerçekleşen; 0-1, payda 0 ise null. */
  gecikmeOrani: number | null;
};

/** Bu kadar sonuçlanmış randevunun altında oran "az veri" olarak işaretlenir. */
export const GELMEME_MIN_ORNEK = 10;

export const GUN_ETIKETLERI: Record<string, string> = {
  "1": "Pazartesi",
  "2": "Salı",
  "3": "Çarşamba",
  "4": "Perşembe",
  "5": "Cuma",
  "6": "Cumartesi",
  "7": "Pazar",
};

function satiriZenginlestir(s: GelmemeRpcSatiri): GelmemeSatiri {
  const sonuclanan = s.gerceklesen + s.gelmedi;
  return {
    ...s,
    etiket: s.boyut === "gun" ? (GUN_ETIKETLERI[s.anahtar] ?? s.etiket) : s.etiket,
    sonuclanan,
    gelmemeOrani: sonuclanan > 0 ? s.gelmedi / sonuclanan : null,
    gecikmeOrani: s.gerceklesen > 0 ? s.gecikmeli / s.gerceklesen : null,
  };
}

export type GelmemeAnalizi = {
  toplam: GelmemeSatiri;
  terapist: GelmemeSatiri[];
  saat: GelmemeSatiri[];
  gun: GelmemeSatiri[];
  ay: GelmemeSatiri[];
  hasta: GelmemeSatiri[];
};

const BOS_TOPLAM: GelmemeRpcSatiri = {
  boyut: "toplam",
  anahtar: "toplam",
  etiket: "Toplam",
  gerceklesen: 0,
  gelmedi: 0,
  gecikmeli: 0,
  iptal: 0,
  ertelendi: 0,
  isaretlenmemis: 0,
};

/**
 * Sıralama: terapist en yüksek gelmeme oranından (az verili satırlar sonda),
 * saat/gün/ay doğal sırada, hasta gelmeme sayısına göre (RPC zaten sıralı).
 */
export function gelmemeAnaliziniHazirla(satirlar: GelmemeRpcSatiri[]): GelmemeAnalizi {
  const z = satirlar.map(satiriZenginlestir);
  const boyut = (b: GelmemeBoyutu) => z.filter((s) => s.boyut === b);
  const yeterliMi = (s: GelmemeSatiri) => s.sonuclanan >= GELMEME_MIN_ORNEK;

  return {
    toplam: z.find((s) => s.boyut === "toplam") ?? satiriZenginlestir(BOS_TOPLAM),
    terapist: boyut("terapist").sort(
      (a, b) =>
        Number(yeterliMi(b)) - Number(yeterliMi(a)) ||
        (b.gelmemeOrani ?? -1) - (a.gelmemeOrani ?? -1) ||
        a.etiket.localeCompare(b.etiket, "tr")
    ),
    saat: boyut("saat").sort((a, b) => a.anahtar.localeCompare(b.anahtar)),
    gun: boyut("gun").sort((a, b) => Number(a.anahtar) - Number(b.anahtar)),
    ay: boyut("ay").sort((a, b) => a.anahtar.localeCompare(b.anahtar)),
    hasta: boyut("hasta"),
  };
}

export function yuzdeFormat(oran: number | null): string {
  if (oran === null) return "—";
  return `%${(oran * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}
