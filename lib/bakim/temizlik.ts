// Günlük temizlik çekirdeği (scripts/bakim/temizlik). `tx`: bir kliniğin sistem bağlamı (RLS: yalnız o kliniğin satırları silinebilir). İdempotent.
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";

export type TemizlikSonucu = { islemAnahtari: number; bildirimBaglanti: number };

/** 2 günden eski mali yazma idempotency anahtarları; süresi 1 günden uzun zaman önce dolmuş bildirim bağlantıları. */
export async function klinikTemizle(tx: Tx): Promise<TemizlikSonucu> {
  const a = await tx.execute(sql`delete from islem_anahtari where olusturma < now() - interval '2 days'`);
  // RETURNING kullanılmaz: uygulama rolünün bu tabloda SELECT yetkisi yoktur (yalnız INSERT, DELETE).
  const b = await tx.execute(sql`delete from bildirim_baglanti where son_kullanma < now() - interval '1 day'`);
  return { islemAnahtari: a.rowCount ?? 0, bildirimBaglanti: b.rowCount ?? 0 };
}
