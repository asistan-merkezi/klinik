import type { RandevuSatir } from "@/types/randevu";
import type { OdaDurumu } from "./oda-durumu";

/** Sıradaki randevu bu süre içindeyse oda "Hazırlanıyor" sayılır (veri modelinde ayrı bir sinyal yok, bu eşikle türetiliyor). */
export const HAZIRLANIYOR_ESIK_DAKIKA = 15;

/**
 * `mevcut` (içeride/geldi) doluysa "mesgul"; boşsa ve `sonraki` (planlı) eşik
 * içindeyse "hazirlaniyor"; aksi halde "musait".
 */
export function odaDurumuHesapla(
  mevcut: RandevuSatir | null,
  sonraki: RandevuSatir | null,
  simdi: Date
): OdaDurumu {
  if (mevcut) return "mesgul";

  if (sonraki) {
    const dakikaKaldi = (new Date(sonraki.baslangic).getTime() - simdi.getTime()) / 60_000;
    if (dakikaKaldi <= HAZIRLANIYOR_ESIK_DAKIKA) return "hazirlaniyor";
  }

  return "musait";
}
