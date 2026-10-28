import { formatDateForInput } from "@/lib/datetime";
import { ayAraligi } from "@/lib/utils";
import { and, asc, gte, inArray, lt } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";

/** Prime sayılan randevu durumları — hakediş ekranı, elle dönem kapatma ve cron AYNI listeyi kullanır. */
export const PRIME_SAYILAN_DURUMLAR = ["geldi", "gecikmeli_geldi", "tamamlandi"] as const;

export type SeansSayimTerapisti = {
  terapistId: string;
  personelId: string;
  istenCikisTarihi: string | null;
};

/**
 * Verilen ay (yyyy-MM, İstanbul takvimi) içinde her personelin prime sayılan seans sayısı. Puantaj Cetveli önizlemesi, elle "Dönem Kapat" ve aylık
 * otomatik kapama betiği bu TEK fonksiyonu kullanır. İşten çıkış tarihinden SONRAKİ seanslar sayılmaz (İstanbul günü karşılaştırması).
 * Sorgu hatasında FIRLATIR: eksik sayımla dönem kapatmak geri alınamaz şekilde eksik prim yazar.
 */
export async function seansSayilariniGetirTx(tx: Tx, terapistler: SeansSayimTerapisti[], ayParam: string): Promise<Map<string, number>> {
  const sonuc = new Map<string, number>();
  if (terapistler.length === 0) return sonuc;

  const ay = ayAraligi(ayParam);
  const terapistById = new Map(terapistler.map((t) => [t.terapistId, t]));
  const R = sema.randevu;
  const satirlar = await tx
    .select({ id: R.id, terapist_id: R.terapistId, baslangic: R.baslangic })
    .from(R)
    .where(and(inArray(R.terapistId, terapistler.map((t) => t.terapistId)), inArray(R.durum, [...PRIME_SAYILAN_DURUMLAR]), gte(R.baslangic, ay.baslangic), lt(R.baslangic, ay.bitis)))
    .orderBy(asc(R.baslangic), asc(R.id));

  for (const r of satirlar) {
    const terapist = r.terapist_id ? terapistById.get(r.terapist_id) : undefined;
    if (!terapist) continue;
    if (terapist.istenCikisTarihi && formatDateForInput(r.baslangic) > terapist.istenCikisTarihi) continue;
    sonuc.set(terapist.personelId, (sonuc.get(terapist.personelId) ?? 0) + 1);
  }
  return sonuc;
}
