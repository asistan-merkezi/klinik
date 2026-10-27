// Postgres fonksiyonu (eski Supabase `.rpc()`) çağrısı: adlandırılmış argümanlarla `select * from fn(p_x => $1, ...)`.
// Fonksiyon adı SABİT bir dize olmalıdır (kullanım tarayıcısı `rpc(tx, "ad"` kalıbından EXECUTE yetkisini türetir; scripts/dev/kullanim-tara.mjs).
// Dönüş: satır dizisi (skaler dönen fonksiyonlarda tek kolon, kolon adı fonksiyon adıdır).
import { sql } from "drizzle-orm";
import type { Tx } from "./baglam";

/** Nesne ve nesne içeren diziler (jsonb parametreler) JSON metnine çevrilir; node-pg diziyi Postgres dizisi sanıp bozar. Düz değerler aynen gider. */
function arguman(v: unknown): unknown {
  if (v === null || typeof v !== "object" || v instanceof Date) return v;
  if (Array.isArray(v) && !v.some((x) => x !== null && typeof x === "object")) return v; // text[]/int[] gibi düz diziler
  return JSON.stringify(v);
}

export async function rpc<T = Record<string, unknown>>(tx: Tx, ad: string, args: Record<string, unknown> = {}): Promise<T[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(ad)) throw new Error(`geçersiz fonksiyon adı: ${ad}`);
  const girdiler = Object.entries(args).map(([k, v]) => sql`${sql.identifier(k)} => ${arguman(v)}`);
  const sonuc = await tx.execute(sql`select * from ${sql.identifier(ad)}(${sql.join(girdiler, sql`, `)})`);
  return sonuc.rows as T[];
}
