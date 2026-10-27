// Yerel, geçici Postgres kümesi (embedded-postgres, gerçek Postgres 18). Üretim değildir; yalnız şema üretimi ve kontrol testleri için.
// Veri klasörü: scripts/dev/.veri/<ad> (git'te yok).
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERI = path.join(path.dirname(fileURLToPath(import.meta.url)), ".veri");
export const SUPER_SIFRE = "yerel-deneme";

export async function kumeBaslat(ad, port, { sifirla = false } = {}) {
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
