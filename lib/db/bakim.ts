// Bakım betikleri (scripts/, Task Scheduler) için yardımcı. bakim_rolu ile bağlanır (BAKIM_DATABASE_URL; yalnız bakim.env'de):
//   - bakim_rolu BYPASSRLS DEĞİLDİR; yalnız klinik(id, ad) listesini okuyabilir ve bakım fonksiyonlarını çağırabilir.
//   - Klinik başına iş, aynı bağlantıda `SET LOCAL ROLE klinik_uygulama` + `app.tenant_id` ile yapılır: yani uygulamayla AYNI RLS kurallarına tabidir
//     ve bir klinik transaction'ında başka kliniğin verisi görünmez. Hata bir kliniği durdurur, diğerlerini durdurmaz.
//   - Uygulama süreci (Next.js) bu dosyayı İÇE AKTARMAZ ve BAKIM_DATABASE_URL'i görmez.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as sema from "./sema/schema";
import * as iliskiler from "./sema/relations";
import { baglantiAdresi } from "./ortam";
import type { Tx } from "./baglam";

const semaTumu = { ...sema, ...iliskiler };

export type KlinikSonucu<T> = { klinikId: string; ad: string; ok: true; sonuc: T } | { klinikId: string; ad: string; ok: false; hata: string };

export type BakimSecenekleri = {
  /** Aynı anda işlenen klinik sayısı (varsayılan 4). */
  eszamanli?: number;
  /** Test/özel kullanım: hazır havuz verilebilir. */
  havuz?: Pool;
  /** Betiğin adını sistem bağlamı kaydı için kullanıcı kimliği yerine yazmak isteyenler için (boş bırakılırsa app.user_id verilmez). */
  kullaniciId?: string;
};

export async function bakimKlinikleriniDolas<T>(is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>, secenekler: BakimSecenekleri = {}): Promise<KlinikSonucu<T>[]> {
  const havuz = secenekler.havuz ?? new Pool({ connectionString: baglantiAdresi("BAKIM_DATABASE_URL"), max: (secenekler.eszamanli ?? 4) + 1, application_name: "klinik-bakim" });
  const db = drizzle(havuz, { schema: semaTumu });
  try {
    const klinikler = (await havuz.query<{ id: string; ad: string }>("select id, ad from klinik order by id")).rows;
    const sonuclar: KlinikSonucu<T>[] = [];
    const sira = [...klinikler];
    const isci = async () => {
      for (let k = sira.shift(); k; k = sira.shift()) {
        try {
          const sonuc = await db.transaction(async (tx) => {
            await tx.execute(sql`set local role klinik_uygulama`);
            await tx.execute(sql`select set_config('app.tenant_id', ${k.id}, true), set_config('app.user_id', ${secenekler.kullaniciId ?? ""}, true)`);
            return is(tx as unknown as Tx, k);
          });
          sonuclar.push({ klinikId: k.id, ad: k.ad, ok: true, sonuc });
        } catch (e) {
          sonuclar.push({ klinikId: k.id, ad: k.ad, ok: false, hata: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, secenekler.eszamanli ?? 4) }, isci));
    return sonuclar;
  } finally {
    if (!secenekler.havuz) await havuz.end();
  }
}
