// Bakım betikleri (scripts/bakim/, Task Scheduler) için yardımcı. bakim_rolu ile bağlanır (BAKIM_DATABASE_URL; yalnız bakim.env'de):
//   - bakim_rolu BYPASSRLS DEĞİLDİR; yalnız klinik(id, ad) listesini, global resmi_tatil'i okuyup yazabilir ve bakım fonksiyonlarını çağırabilir.
//   - Klinik başına iş, aynı bağlantıda `SET LOCAL ROLE klinik_uygulama` + `app.tenant_id` ile yapılır: yani uygulamayla AYNI RLS kurallarına tabidir
//     ve bir klinik transaction'ında başka kliniğin verisi görünmez (sistem_baglami() = session_user bakim_rolu → yalnız 0016'daki dar politikalar açılır).
//     Hata bir kliniği durdurur, diğerlerini durdurmaz.
//   - Uygulama süreci (Next.js) bu dosyayı İÇE AKTARMAZ ve BAKIM_DATABASE_URL'i görmez.
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as sema from "./sema/schema";
import * as iliskiler from "./sema/relations";
import { baglantiAdresi } from "./ortam";
import type { Tx } from "./baglam";

const semaTumu = { ...sema, ...iliskiler };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type KlinikSonucu<T> = { klinikId: string; ad: string; ok: true; sonuc: T } | { klinikId: string; ad: string; ok: false; hata: string };

export type BakimSecenekleri = {
  /** Aynı anda işlenen klinik sayısı (varsayılan 4). */
  eszamanli?: number;
  /** Test/özel kullanım: hazır havuz verilebilir (kapatma çağırana aittir). */
  havuz?: Pool;
  /** Boş bırakılırsa app.user_id verilmez (bakım işlerinde kullanıcı kimliği YOKTUR). */
  kullaniciId?: string;
};

export type BakimOturumu = {
  /** bakim_rolu olarak (tenant bağlamı YOK, rol değişimi YOK) bir transaction: yalnız global kayıtlar (resmi_tatil) ve bakım fonksiyonları. */
  global<T>(is: (tx: Tx) => Promise<T>): Promise<T>;
  klinikler(): Promise<{ id: string; ad: string }[]>;
  /** Tek klinik için tek transaction (SET LOCAL ROLE klinik_uygulama + app.tenant_id). */
  klinikte<T>(klinikId: string, is: (tx: Tx) => Promise<T>): Promise<T>;
  /** Tüm klinikleri sınırlı eşzamanlılıkla dolaşır; bir kliniğin hatası diğerlerini durdurmaz. */
  dolas<T>(is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>): Promise<KlinikSonucu<T>[]>;
  kapat(): Promise<void>;
};

export function bakimOturumuAc(secenekler: BakimSecenekleri = {}): BakimOturumu {
  const havuz = secenekler.havuz ?? new Pool({ connectionString: baglantiAdresi("BAKIM_DATABASE_URL"), max: (secenekler.eszamanli ?? 4) + 1, application_name: "klinik-bakim" });
  const db = drizzle(havuz, { schema: semaTumu });

  const klinikler = async () => (await havuz.query<{ id: string; ad: string }>("select id, ad from klinik order by id")).rows;
  const klinikte = async <T>(klinikId: string, is: (tx: Tx) => Promise<T>): Promise<T> => {
    if (!UUID.test(klinikId)) throw new Error("geçersiz klinik kimliği");
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local role klinik_uygulama`);
      await tx.execute(sql`select set_config('app.tenant_id', ${klinikId}, true), set_config('app.user_id', ${secenekler.kullaniciId ?? ""}, true)`);
      return is(tx as unknown as Tx);
    });
  };

  return {
    global: (is) => db.transaction((tx) => is(tx as unknown as Tx)),
    klinikler,
    klinikte,
    async dolas<T>(is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>) {
      const sira = [...(await klinikler())];
      const sonuclar: KlinikSonucu<T>[] = [];
      const isci = async () => {
        for (let k = sira.shift(); k; k = sira.shift()) {
          try {
            sonuclar.push({ klinikId: k.id, ad: k.ad, ok: true, sonuc: await klinikte(k.id, (tx) => is(tx, k)) });
          } catch (e) {
            sonuclar.push({ klinikId: k.id, ad: k.ad, ok: false, hata: e instanceof Error ? e.message : String(e) });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, secenekler.eszamanli ?? 4) }, isci));
      return sonuclar;
    },
    async kapat() {
      if (!secenekler.havuz) await havuz.end();
    },
  };
}

/** Geriye uyumlu kısayol: tüm klinikleri dolaşır ve havuzu kapatır. */
export async function bakimKlinikleriniDolas<T>(is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>, secenekler: BakimSecenekleri = {}): Promise<KlinikSonucu<T>[]> {
  const oturum = bakimOturumuAc(secenekler);
  try {
    return await oturum.dolas(is);
  } finally {
    await oturum.kapat();
  }
}
