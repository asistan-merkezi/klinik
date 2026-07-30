import { ayBaslangiciUTC } from "@/lib/utils";
import { formatDateForInput } from "@/lib/datetime";

/**
 * Rapor hesaplamalarının tamamı bu aralık tipini kullanır: `baslangic`/`bitis`
 * randevu/odeme gibi timestamptz kolonlarıyla, `baslangicTarih`/`bitisTarih`
 * klinik_harcama/personel_ekstra_hakedis gibi timezone'suz `date` kolonlarıyla
 * karşılaştırmak için ([baslangic, bitis) — üst sınır her zaman exclusive).
 */
export type RaporDonemi = {
  baslangic: string;
  bitis: string;
  baslangicTarih: string;
  bitisTarih: string;
  etiket: string;
};

function donemOlustur(baslangicIso: string, bitisIso: string, etiket: string): RaporDonemi {
  return {
    baslangic: baslangicIso,
    bitis: bitisIso,
    baslangicTarih: formatDateForInput(baslangicIso),
    bitisTarih: formatDateForInput(bitisIso),
    etiket,
  };
}

/** ay: 1-12. */
export function raporAyDonemi(yil: number, ay: number): RaporDonemi {
  const baslangicIso = ayBaslangiciUTC(yil, ay - 1);
  const bitisIso = ayBaslangiciUTC(yil, ay);
  const etiket = new Date(baslangicIso).toLocaleDateString("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
  return donemOlustur(baslangicIso, bitisIso, etiket);
}

export function raporYilDonemi(yil: number): RaporDonemi {
  const baslangicIso = ayBaslangiciUTC(yil, 0);
  const bitisIso = ayBaslangiciUTC(yil + 1, 0);
  return donemOlustur(baslangicIso, bitisIso, String(yil));
}

/** Yılın 12 ayının her biri için ayrı dönem aralığı (yıllık grafik kırılımı için). */
export function yilinAylari(yil: number): RaporDonemi[] {
  return Array.from({ length: 12 }, (_, i) => raporAyDonemi(yil, i + 1));
}
