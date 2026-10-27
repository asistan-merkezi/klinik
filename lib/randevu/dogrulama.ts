// Randevu yazarken istemciden gelen kimliklerin (hasta/terapist/oda/tedavi/cihaz) ÇAĞIRANIN KLİNİĞİNE ait olduğunu doğrular (savunma derinliği).
// Neden gerekli: yabancı anahtar kontrolü RLS'i atlar — başka kliniğin hasta/oda uuid'si verilirse INSERT'ün RLS WITH CHECK'i (yalnız randevu.klinik_id'ye bakar)
// geçer ve FK de kabul eder. Bu fonksiyon RLS'li (withTenant) bir transaction içinde çalıştığı için başka kliniğin satırları ZATEN görünmez;
// görünmeyen = yok sayılır.
import { and, eq, inArray } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";

export type RandevuKimlikleri = { hastaId?: string; terapistId?: string; odaId?: string; islemTanimiId?: string; cihazId?: string | null; antrenorId?: string | null; tedaviProtokoluId?: string | null };

async function varMi<T extends { id: unknown }>(tx: Tx, say: () => Promise<T[]>): Promise<boolean> {
  return (await say()).length > 0;
}

/** Eksik/başka kliniğe ait bir kimlik varsa kullanıcıya gösterilecek mesajı döner; hepsi geçerliyse null. */
export async function randevuKimlikleriniDogrula(tx: Tx, k: RandevuKimlikleri): Promise<string | null> {
  if (k.hastaId && !(await varMi(tx, () => tx.select({ id: sema.hasta.id }).from(sema.hasta).where(eq(sema.hasta.id, k.hastaId!)).limit(1)))) return "Hasta bulunamadı.";
  if (k.terapistId && !(await varMi(tx, () => tx.select({ id: sema.terapist.id }).from(sema.terapist).where(eq(sema.terapist.id, k.terapistId!)).limit(1)))) return "Terapist bulunamadı.";
  if (k.odaId && !(await varMi(tx, () => tx.select({ id: sema.oda.id }).from(sema.oda).where(eq(sema.oda.id, k.odaId!)).limit(1)))) return "Oda bulunamadı.";
  if (k.islemTanimiId && !(await varMi(tx, () => tx.select({ id: sema.islemTanimi.id }).from(sema.islemTanimi).where(eq(sema.islemTanimi.id, k.islemTanimiId!)).limit(1)))) return "Tedavi bulunamadı.";
  if (k.cihazId && !(await varMi(tx, () => tx.select({ id: sema.cihaz.id }).from(sema.cihaz).where(eq(sema.cihaz.id, k.cihazId!)).limit(1)))) return "Cihaz bulunamadı.";
  if (k.antrenorId && !(await varMi(tx, () => tx.select({ id: sema.personel.id }).from(sema.personel).where(eq(sema.personel.id, k.antrenorId!)).limit(1)))) return "Antrenör bulunamadı.";
  if (k.tedaviProtokoluId && !(await varMi(tx, () => tx.select({ id: sema.tedaviProtokolu.id }).from(sema.tedaviProtokolu).where(eq(sema.tedaviProtokolu.id, k.tedaviProtokoluId!)).limit(1)))) return "Tedavi protokolü bulunamadı.";
  return null;
}

/** Çoklu kimlik için yardımcı (kullanılmayan import uyarısını önler). */
export const _kullanilmayan = { and, inArray };
