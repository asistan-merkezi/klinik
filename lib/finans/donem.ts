import { bugunIstanbulTarihi, toUTC } from "@/lib/datetime";

export type DonemModu = "aylik" | "yillik";

export type FinansDonemi = {
  mod: DonemModu;
  yil: number;
  /** 1-12 */
  ay: number;
  /** Dahil, "YYYY-MM-DD" (İstanbul takvim günü) */
  baslangic: string;
  /** Hariç, "YYYY-MM-DD" */
  bitis: string;
  /** `baslangic`in İstanbul gün başı, UTC ISO — timestamptz kolonlarıyla karşılaştırma için */
  baslangicTs: string;
  /** `bitis`in İstanbul gün başı, UTC ISO (hariç) */
  bitisTs: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * URL parametrelerinden (`mod`, `yil`, `ay` 1-12) Kasa/Banka/Kredi Kartı dönem
 * aralığını çözer; parametre yoksa İstanbul saatine göre içinde bulunulan ay.
 * Aralık [baslangic, bitis) yarı açıktır. timestamptz sınırları UTC değil
 * İSTANBUL gün başıdır (aksi halde 00:00-03:00 arası kayıtlar önceki güne düşer).
 */
export function finansDonemiCoz(sp: { mod?: string; yil?: string; ay?: string }): FinansDonemi {
  const [simdiYil, simdiAy] = bugunIstanbulTarihi().split("-").map(Number);
  const mod: DonemModu = sp.mod === "yillik" ? "yillik" : "aylik";
  const y = Number(sp.yil);
  const a = Number(sp.ay);
  const yil = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : simdiYil;
  const ay = Number.isInteger(a) && a >= 1 && a <= 12 ? a : simdiAy;

  let baslangic: string;
  let bitis: string;
  if (mod === "yillik") {
    baslangic = `${yil}-01-01`;
    bitis = `${yil + 1}-01-01`;
  } else {
    baslangic = `${yil}-${pad(ay)}-01`;
    bitis = ay === 12 ? `${yil + 1}-01-01` : `${yil}-${pad(ay + 1)}-01`;
  }
  return {
    mod,
    yil,
    ay,
    baslangic,
    bitis,
    baslangicTs: toUTC(`${baslangic}T00:00:00`),
    bitisTs: toUTC(`${bitis}T00:00:00`),
  };
}
