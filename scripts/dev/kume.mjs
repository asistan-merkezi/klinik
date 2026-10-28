// Yerel, geçici Postgres kümesi (embedded-postgres, gerçek Postgres 18). Üretim değildir; yalnız şema üretimi ve kontrol testleri için.
// Veri klasörü: scripts/dev/.veri/<ad> (git'te yok).
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERI = path.join(path.dirname(fileURLToPath(import.meta.url)), ".veri");
export const SUPER_SIFRE = "yerel-deneme";

const DIS_ROLLER = ["klinik_migrasyon", "klinik_yedek", "bakim_rolu", "kimlik_rolu", "klinik_uygulama", "klinik_anonim", "klinik_tanima", "klinik_sahip"];

/**
 * DIŞ KÜME MODU (CI: ubuntu + Postgres servis konteyneri): TEST_PG_DIS_PORT verilirse gömülü Postgres BAŞLATILMAZ; o porttaki hazır süper kullanıcılı
 * (postgres / SUPER_SIFRE) kümeye bağlanılır. `sifirla` veritabanını ve rolleri siler (yalnız bu betiklerin yarattığı adlar). Üretim DB'sine ASLA yönlendirmeyin.
 */
async function disKume(port, sifirla) {
  const baglan = async (veritabani, kullanici = "postgres", sifre = SUPER_SIFRE) => {
    const c = new pg.Client({ host: process.env.TEST_PG_DIS_HOST ?? "localhost", port, user: kullanici, password: sifre, database: veritabani });
    await c.connect();
    return c;
  };
  if (sifirla) {
    const r = await baglan("postgres");
    try {
      await r.query("DROP DATABASE IF EXISTS klinik WITH (FORCE)");
      for (const rol of DIS_ROLLER) await r.query(`DROP ROLE IF EXISTS ${rol}`);
    } finally { await r.end(); }
  }
  return { port, baglan, durdur: async () => {} };
}

export async function kumeBaslat(ad, port, { sifirla = false } = {}) {
  if (process.env.TEST_PG_DIS_PORT) return disKume(Number(process.env.TEST_PG_DIS_PORT), sifirla);
  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const dizin = path.join(VERI, ad);
  if (sifirla && fs.existsSync(dizin)) fs.rmSync(dizin, { recursive: true, force: true });
  const sunucu = new EmbeddedPostgres({
    databaseDir: dizin, user: "postgres", password: SUPER_SIFRE, port, persistent: true,
    // Türkçe Windows'ta varsayılan locale adı initdb'yi bozar; sıralama zaten collation'a güvenmez.
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
    onLog: () => {}, onError: () => {},
  });
  if (!fs.existsSync(dizin)) await sunucu.initialise();
  await sunucu.start();
  const baglan = async (veritabani, kullanici = "postgres", sifre = SUPER_SIFRE) => {
    const c = new pg.Client({ host: "localhost", port, user: kullanici, password: sifre, database: veritabani });
    await c.connect();
    return c;
  };
  return { port, baglan, durdur: () => sunucu.stop() };
}

/** psql değişkenlerini (:'ad') değiştirir, psql meta komutlarını (\ ile başlayan satırlar) atar. */
export function sqlHazirla(metin, degiskenler = {}) {
  const ters = String.fromCharCode(92);
  return metin
    .split("\n").filter((s) => !s.startsWith(ters)).join("\n")
    .replace(/:'(\w+)'/g, (_, k) => {
      if (!(k in degiskenler)) throw new Error(`psql değişkeni verilmedi: ${k}`);
      return `'${String(degiskenler[k]).replace(/'/g, "''")}'`;
    });
}

export const oku = (goreli) => fs.readFileSync(path.join(KOK, goreli), "utf8");
