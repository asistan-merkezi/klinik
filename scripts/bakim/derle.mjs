// Bakım betiklerini (scripts/bakim/*.ts) TEK dosyalık Node paketlerine derler: <cikis>/<ad>.mjs (varsayılan: bakim-dist/).
// Sunucuda npm/derleme yoktur; paket `node <ad>.mjs` ile çalışır (Task Scheduler, scripts/windows/gorevleri-kur.ps1). `@/` takma adı tsconfig'den çözülür.
// Kullanım: node scripts/bakim/derle.mjs [cikis-klasoru]
import { build } from "esbuild";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cikis = resolve(kok, process.argv[2] ?? "bakim-dist");
const giris = readdirSync(join(kok, "scripts", "bakim"))
  .filter((d) => d.endsWith(".ts"))
  .filter((d) => d !== "ortak.ts")
  .map((d) => join(kok, "scripts", "bakim", d));

rmSync(cikis, { recursive: true, force: true });
mkdirSync(cikis, { recursive: true });

await build({
  entryPoints: giris,
  outdir: cikis,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: join(kok, "tsconfig.json"),
  external: ["pg-native"],
  // pg gibi CommonJS bağımlılıkların `require`'ı ESM çıktıda çalışsın.
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  legalComments: "none",
  logLevel: "info",
});
console.log(`${giris.length} bakım betiği derlendi → ${cikis}`);
