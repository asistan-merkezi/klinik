// Resmi tatil otomatik güncelleme (scripts/bakim/resmi-tatil-guncelle). İKİ aşama, ikisi de İDEMPOTENT:
//   1) sabitTatilleriYaz  — bakim_rolu global bağlamında: sabit resmi tatiller (klinik_id NULL) o gün için yoksa eklenir.
//   2) klinikOnerileriniYaz — klinik başına sistem bağlamında: dini bayram önerileri (Nager.Date), o yıl o bayram için kesin tatili ya da önerisi
//      olmayan kliniğe "bekliyor" olarak düşer (yönetici Ayarlar > Resmi Tatiller'de onaylar). Onaylanmamış öneri hiçbir hesaba girmez.
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { nagerBayramlariniAyikla, sabitTatiller, tatilAdiBayrami, type Bayram, type BayramOnerisi } from "./kurallar";

const NAGER_URL = "https://date.nager.at/api/v3/PublicHolidays";

export function guncellenecekYillar(bugun = bugunIstanbulTarihi()): number[] {
  const yil = Number(bugun.slice(0, 4));
  return [yil, yil + 1];
}

export async function nagerdenBayramlar(yil: number): Promise<BayramOnerisi[]> {
  const yanit = await fetch(`${NAGER_URL}/${yil}/TR`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
  return nagerBayramlariniAyikla(await yanit.json(), yil);
}

/** Nager'dan yıl yıl önerileri çeker; ulaşılamayan yıl atlanır ve hata listesine yazılır (sabit tatiller yine yazılır). */
export async function onerileriTopla(yillar: number[], getir: (yil: number) => Promise<BayramOnerisi[]> = nagerdenBayramlar) {
  const oneriler = new Map<number, BayramOnerisi[]>();
  const hatalar: string[] = [];
  for (const yil of yillar) {
    try {
      oneriler.set(yil, await getir(yil));
    } catch (hata) {
      hatalar.push(`${yil}: ${hata instanceof Error ? hata.message : String(hata)}`);
    }
  }
  return { oneriler, hatalar };
}

/** `tx`: bakim_rolu global transaction. Aynı anda iki çalışma çift satır yazmasın diye danışma kilidi alınır (klinik_id NULL için benzersizlik kısıtı çalışmaz). */
export async function sabitTatilleriYaz(tx: Tx, yillar: number[]): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('resmi_tatil_sabit'))`);
  const bas = `${yillar[0]}-01-01`;
  const son = `${yillar[yillar.length - 1] + 1}-01-01`;
  const mevcut = await tx
    .select({ tarih: sema.resmiTatil.tarih })
    .from(sema.resmiTatil)
    .where(and(sql`${sema.resmiTatil.klinikId} is null`, gte(sema.resmiTatil.tarih, bas), lt(sema.resmiTatil.tarih, son)));
  const var_ = new Set(mevcut.map((t) => t.tarih));
  const eksik = yillar.flatMap(sabitTatiller).filter((t) => !var_.has(t.tarih));
  if (eksik.length > 0) await tx.insert(sema.resmiTatil).values(eksik.map((t) => ({ klinikId: null, tarih: t.tarih, ad: t.ad })));
  return eksik.length;
}

/** `tx`: o kliniğin sistem bağlamı. */
export async function klinikOnerileriniYaz(tx: Tx, klinikId: string, oneriler: Map<number, BayramOnerisi[]>, yillar: number[]): Promise<number> {
  const mevcutTatiller = await tx
    .select({ klinikId: sema.resmiTatil.klinikId, tarih: sema.resmiTatil.tarih, ad: sema.resmiTatil.ad })
    .from(sema.resmiTatil)
    .where(and(gte(sema.resmiTatil.tarih, `${yillar[0]}-01-01`), lt(sema.resmiTatil.tarih, `${yillar[yillar.length - 1] + 1}-01-01`)));
  const mevcutOneri = new Set(
    (await tx.select({ yil: sema.resmiTatilOneri.yil, bayram: sema.resmiTatilOneri.bayram }).from(sema.resmiTatilOneri).where(and(eq(sema.resmiTatilOneri.klinikId, klinikId), inArray(sema.resmiTatilOneri.yil, yillar)))).map((o) => `${o.yil}|${o.bayram}`)
  );
  const kapsandi = (yil: number, bayram: Bayram) =>
    mevcutOneri.has(`${yil}|${bayram}`) ||
    mevcutTatiller.some((t) => (t.klinikId === null || t.klinikId === klinikId) && t.tarih.startsWith(`${yil}-`) && tatilAdiBayrami(t.ad) === bayram);

  const eklenecek: (typeof sema.resmiTatilOneri.$inferInsert)[] = [];
  for (const [yil, liste] of oneriler) {
    for (const bayram of ["ramazan", "kurban"] as const) {
      if (kapsandi(yil, bayram)) continue;
      for (const o of liste.filter((x) => x.bayram === bayram)) eklenecek.push({ klinikId, yil, bayram, tarih: o.tarih, ad: o.ad, kaynak: "nager" });
    }
  }
  if (eklenecek.length > 0) await tx.insert(sema.resmiTatilOneri).values(eklenecek).onConflictDoNothing();
  return eklenecek.length;
}
