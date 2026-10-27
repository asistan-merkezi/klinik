// Tenant türetme (Seçenek A) performans ölçümü. İki klinik, ~200 bin hasta satırı; klinik_uygulama rolüyle sorgu süreleri (ms, 15 tekrarın ortancası).
// Kullanım:  node scripts/dev/tenant-performans.mjs <etiket>    (sonuç db/kontrol/tenant-performans.json içine etiketle eklenir)
import fs from "node:fs";
import path from "node:path";
import { testKumesiKur, baglamdaCalistir } from "./test-kur.mjs";
import { KOK } from "./kume.mjs";

const etiket = process.argv[2] ?? "olcum";
const N = Number(process.env.PERF_SATIR ?? 100000);
const duzenek = await testKumesiKur();
try {
  const sup = await duzenek.baglanSuper();
  const { k1, k2 } = duzenek.ids;
  // Toplu yükleme: tetikleyicileri atla (yalnız ölçüm verisi), RLS süper kullanıcıda atlanır
  await sup.query("BEGIN");
  await sup.query("SET LOCAL session_replication_role = replica");
  for (const k of [k1, k2]) {
    await sup.query(`insert into hasta(klinik_id, ad_soyad, telefon) select $1, 'Olcum ' || g, '5' || lpad(g::text, 9, '0') from generate_series(1, $2) g`, [k.klinik, N]);
  }
  await sup.query("COMMIT");
  await sup.query("ANALYZE hasta");
  const c = await duzenek.baglanRol("klinik_uygulama");
  const ortanca = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const sorgular = {
    "count(*) from hasta (tüm klinik satırları, RLS filtresi her satırda)": "select count(*) from hasta",
    "hasta + telefon filtresi (aralık taraması)": "select count(*) from hasta where telefon like '5000%'",
    "PK ile tek satır": `select * from hasta where id = '${k1.hasta}'`,
    "randevu ⨝ hasta (iki RLS'li tablo)": "select count(*) from randevu r join hasta h on h.id = r.hasta_id",
  };
  const sonuc = {};
  for (const [ad, sql] of Object.entries(sorgular)) {
    const sureler = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      const r = await baglamdaCalistir(c, { kullanici: k1.kullanici, tenant: k1.klinik }, sql);
      if (!r.tamam) throw new Error(`${ad}: ${r.hata}`);
      sureler.push(performance.now() - t0);
    }
    sonuc[ad] = Math.round(ortanca(sureler) * 100) / 100;
  }
  // EXPLAIN: politika ifadesinin tek sefer (InitPlan) mi, satır başına mı çalıştığı
  await c.query("BEGIN");
  await c.query("select set_config('app.user_id',$1,true), set_config('app.tenant_id',$2,true)", [k1.kullanici, k1.klinik]);
  const plan = (await c.query("EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF) select count(*) from hasta")).rows.map((r) => r["QUERY PLAN"]).join("\n");
  await c.query("ROLLBACK");
  await c.end();
  await sup.end();
  const dosya = path.join(KOK, "db/kontrol/tenant-performans.json");
  const mevcut = fs.existsSync(dosya) ? JSON.parse(fs.readFileSync(dosya, "utf8")) : {};
  mevcut[etiket] = { satirSayisiKlinikBasina: N, ortancaMs: sonuc, plan };
  fs.writeFileSync(dosya, JSON.stringify(mevcut, null, 1) + "\n", "utf8");
  console.log(etiket, JSON.stringify(sonuc, null, 1));
  console.log(plan);
} finally {
  await duzenek.durdur();
}
