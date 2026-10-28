// Denetim Geçmişi veri çekimi (Drizzle). audit_log RLS: klinik_admin kendi kliniği; super_admin yalnız aktif destek bağlamındaki klinik (0015).
// Sorgu planı: idx_audit_log_klinik_tarih (klinik_id, created_at DESC) üzerinden tarih aralığı + sıralı sayfalama (tests/db/modul-yonetim.test.ts 100k satırla EXPLAIN eder).
import { and, asc, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { DENETIM_GRUP_TABLOLARI, type DenetimGrubu } from "./gorunum";

export const DENETIM_SAYFA_BOYUTU = 50;
export type DenetimEylemFiltresi = "" | "insert" | "update" | "delete" | "select" | "destek";

export type DenetimSatiri = {
  id: string;
  created_at: string;
  eylem: string;
  hedef_tablo: string | null;
  hedef_id: string | null;
  detay: unknown;
  kullanici: { ad_soyad: string | null } | null;
};

type SorguGirdisi = { klinikId: string; gun: number; grup: DenetimGrubu | "hepsi"; eylem: DenetimEylemFiltresi; sayfa: number; simdi?: Date };

/** Sayfa sorgusu (çalıştırılmamış kurucu): hem sayfa hem performans testi (EXPLAIN, `.toSQL()`) aynı sorguyu kullanır. */
export function denetimSorgusuKur(tx: Tx, g: SorguGirdisi) {
  const A = sema.auditLog;
  const baslangic = new Date((g.simdi ?? new Date()).getTime() - g.gun * 86_400_000).toISOString();
  const kosullar = [eq(A.klinikId, g.klinikId), gte(A.createdAt, baslangic)];
  if (g.eylem === "destek") kosullar.push(inArray(A.eylem, ["destek_baglami_ac", "destek_baglami_kapat"]));
  else if (g.eylem) kosullar.push(eq(A.eylem, g.eylem));
  if (g.grup === "finans" || g.grup === "hasta") kosullar.push(inArray(A.hedefTablo, DENETIM_GRUP_TABLOLARI[g.grup]));
  else if (g.grup === "diger") kosullar.push(notInArray(A.hedefTablo, [...DENETIM_GRUP_TABLOLARI.finans, ...DENETIM_GRUP_TABLOLARI.hasta]));

  // Bir fazla çekilir: "sonraki sayfa var mı" için ayrı COUNT sorgusu gerekmez.
  return tx
    .select({ id: A.id, created_at: A.createdAt, eylem: A.eylem, hedef_tablo: A.hedefTablo, hedef_id: A.hedefId, detay: A.detay, ad_soyad: sema.kullanici.adSoyad })
    .from(A)
    .leftJoin(sema.kullanici, eq(sema.kullanici.id, A.kullaniciId))
    .where(and(...kosullar))
    .orderBy(desc(A.createdAt), asc(A.id))
    .limit(DENETIM_SAYFA_BOYUTU + 1)
    .offset((g.sayfa - 1) * DENETIM_SAYFA_BOYUTU);
}

export async function denetimSayfasiGetir(tx: Tx, g: SorguGirdisi): Promise<{ satirlar: DenetimSatiri[]; sonrakiVar: boolean }> {
  const ham = await denetimSorgusuKur(tx, g);
  const sonrakiVar = ham.length > DENETIM_SAYFA_BOYUTU;
  const satirlar: DenetimSatiri[] = ham.slice(0, DENETIM_SAYFA_BOYUTU).map(({ ad_soyad, ...s }) => ({ ...s, kullanici: ad_soyad === null ? null : { ad_soyad } }));
  return { satirlar, sonrakiVar };
}

/** Sayfadaki (en çok 50) satırın hasta adları; hasta id'leri kısa liste olduğundan IN güvenlidir. */
export async function hastaAdlariniGetir(tx: Tx, hastaIdleri: string[]): Promise<Map<string, string>> {
  const harita = new Map<string, string>();
  if (hastaIdleri.length === 0) return harita;
  for (const h of await tx.select({ id: sema.hasta.id, ad: sema.hasta.adSoyad }).from(sema.hasta).where(inArray(sema.hasta.id, hastaIdleri))) harita.set(h.id, h.ad);
  return harita;
}
