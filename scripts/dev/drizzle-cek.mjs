// Test kümesini (db/ dosyalarından kurulu) başlatır, drizzle-kit pull ile lib/db/sema/{schema,relations}.ts üretir.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { kumeBaslat, KOK, SUPER_SIFRE } from "./kume.mjs";
import { testKumesiKur } from "./test-kur.mjs";
const duzenek = await testKumesiKur();
try {
  const url = `postgres://postgres:${SUPER_SIFRE}@localhost:${duzenek.kume.port}/klinik`;
  const r = spawnSync("npx", ["drizzle-kit", "pull", "--config", "scripts/dev/drizzle.config.ts"], { cwd: KOK, stdio: "inherit", shell: true, env: { ...process.env, DRIZZLE_URL: url } });
  if (r.status !== 0) throw new Error("drizzle-kit pull başarısız");
  const { spawnSync: sp } = await import("node:child_process");
  sp(process.execPath, [path.join(KOK, "scripts/dev/sema-duzelt.mjs")], { stdio: "inherit" });
} finally { await duzenek.durdur(); }
void kumeBaslat; void path;
