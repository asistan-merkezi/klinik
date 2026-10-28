// 0002_temel_sema.sql ve tohum verisini YENİDEN ÜRETİR (adım adım: docs/sema-uretim.md).
//   1) Geçici Postgres kümesi 'ref' (port 54330) + eski migration uyumluluk katmanı (eski-migration-uyumluluk.sql)
//   2) db/arsiv/eski-migrationlar (172) sırayla + db/arsiv/eski-bekleyen/…puantaj_pin_kaldir.sql
//   3) kod → tablo kullanım taraması (kullanim-tara.mjs)  4) sema-uret.mjs → db/migrations/0002, db/seed
// Kullanım: cd scripts/dev && npm install && node yeniden-uret.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { kumeBaslat, KOK, oku } from "./kume.mjs";

const PORT = Number(process.env.DEV_REF_PORT ?? 54330);
const kume = await kumeBaslat("ref", PORT, { sifirla: true });
try {
  const admin = await kume.baglan("postgres");
  await admin.query("create database ref");
  await admin.end();
  const c = await kume.baglan("ref");
  await c.query(fs.readFileSync(path.join(KOK, "scripts/dev/eski-migration-uyumluluk.sql"), "utf8"));

  const dizin = path.join(KOK, "db/arsiv/eski-migrationlar");
  const dosyalar = fs.readdirSync(dizin).filter((f) => f.endsWith(".sql")).sort();
  // Bu migration canlı kliniğin SABİT UUID'sine veri yazar (DDL yok); boş veritabanında geçici klinikle çalıştırılır, katalog tohumu kalır.
  const SABIT_KLINIK = "20260918100000_pozisyon_katalogu_departman_yapisi.sql";
  const SABIT_ID = "7d259889-5bd8-4702-9e39-d86488234667";
  let hata = 0;
  for (const f of dosyalar) {
    try {
      if (f === SABIT_KLINIK) await c.query(`insert into klinik(id, ad) values ('${SABIT_ID}', 'GECICI')`);
      await c.query(fs.readFileSync(path.join(dizin, f), "utf8"));
      if (f === SABIT_KLINIK) await c.query(`delete from klinik where id = '${SABIT_ID}'`);
    } catch (e) {
      hata++;
      console.error("HATA", f, e.message.slice(0, 200));
      await c.query("rollback").catch(() => {});
    }
  }
  await c.query(oku("db/arsiv/eski-bekleyen/20261003110000_puantaj_pin_kaldir.sql"));
  await c.end();
  console.log(`referans: ${dosyalar.length} migration, ${hata} hata`);
  if (hata) throw new Error("referans kurulumunda hata var, üretim durduruldu");

  const calistir = (betik, env = {}) => {
    const r = spawnSync(process.execPath, [path.join(KOK, "scripts/dev", betik)], { cwd: KOK, stdio: "inherit", env: { ...process.env, ...env } });
    if (r.status !== 0) throw new Error(`${betik} başarısız`);
  };
  calistir("kullanim-tara.mjs");
  calistir("sema-uret.mjs", { REF_DB_URL: `postgres://postgres:${encodeURIComponent("yerel-deneme")}@localhost:${PORT}/ref` });
} finally {
  await kume.durdur();
}
