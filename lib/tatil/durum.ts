import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { BAYRAM_ADLARI, bayramDurumu, kontrolEdilecekYillar, type Bayram } from "./kurallar";

export type TatilUyarisi = { yil: number; bayram: Bayram; ad: string; durum: "bekliyor" | "eksik" };

/**
 * Klinik yöneticisine gösterilecek resmi tatil uyarıları: kontrol edilen yıllarda (bu yıl;
 * Eylül'den sonra gelecek yıl da) bayram tarihi onay bekliyorsa ya da hiç girilmemişse.
 * RLS'li client ile çağrılır (klinik_admin kendi kliniğinin önerilerini görür).
 */
export async function resmiTatilUyarilariGetir(tx: Tx): Promise<TatilUyarisi[]> {
  const yillar = kontrolEdilecekYillar(bugunIstanbulTarihi());
  const tatiller = await tx
    .select({ tarih: sema.resmiTatil.tarih, ad: sema.resmiTatil.ad })
    .from(sema.resmiTatil)
    .where(and(gte(sema.resmiTatil.tarih, `${yillar[0]}-01-01`), lt(sema.resmiTatil.tarih, `${yillar[yillar.length - 1] + 1}-01-01`)));
  const oneriler = await tx
    .select({ yil: sema.resmiTatilOneri.yil, bayram: sema.resmiTatilOneri.bayram })
    .from(sema.resmiTatilOneri)
    .where(and(eq(sema.resmiTatilOneri.durum, "bekliyor"), inArray(sema.resmiTatilOneri.yil, yillar)));

  const uyarilar: TatilUyarisi[] = [];
  for (const yil of yillar) {
    for (const bayram of ["ramazan", "kurban"] as const) {
      const durum = bayramDurumu(bayram, yil, tatiller, oneriler);
      if (durum !== "onayli") uyarilar.push({ yil, bayram, ad: BAYRAM_ADLARI[bayram], durum });
    }
  }
  return uyarilar;
}
