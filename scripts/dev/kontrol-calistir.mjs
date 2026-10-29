// Tüm veritabanı kontrollerini iki klinikli deneme düzeneğinde çalıştırır:
//   1) bypassrls-kontrol.sql  2) yetki-matrisi.sql (+ docs/yetki-matrisi.md üretir)
//   3) DEFINER duman testi (bağlam yok / yanlış tenant / doğru tenant)  4) anonim self-servis kayıt testi
// Kullanım: cd scripts/dev && npm install && node kontrol-calistir.mjs   (çıkış kodu 0 = hepsi geçti)
import fs from "node:fs";
import path from "node:path";
import { KOK, sqlHazirla, oku } from "./kume.mjs";
import { testKumesiKur } from "./test-kur.mjs";
import { definerDumanTesti } from "../../db/kontrol/definer-duman-testi.mjs";
import { anonimKayitTesti } from "../../db/kontrol/anonim-kayit-testi.mjs";
import { yetkisizRaporu } from "./yetkisiz-rapor.mjs";

const duzenek = await testKumesiKur();
let basarisiz = 0;
const bolum = (b) => console.log(`\n=== ${b} ===`);
try {
  const sup = await duzenek.baglanSuper();
  // Geçici dış küme (CI Postgres konteyneri) her adresten bağlantı kabul eder; pg_hba denetimi yalnız orada atlanır (üretimde ayarlanmaz).
  if (process.env.TEST_PG_DIS_PORT) await sup.query("SET klinik.hba_kontrol = 'atla'");

  bolum("bypassrls-kontrol.sql");
  const r1 = await sup.query(sqlHazirla(oku("db/kontrol/bypassrls-kontrol.sql"))).then((x) => x, (e) => e);
  const bypassSonuc = Array.isArray(r1) ? r1.find((x) => x.fields?.some((f) => f.name === "kontrol")) : null;
  if (r1 instanceof Error) {
    basarisiz++;
    console.log("BAŞARISIZ:", r1.message);
    // Ayrıntı için DO bloğundan önceki listeyi yeniden çalıştır
    const metin = sqlHazirla(oku("db/kontrol/bypassrls-kontrol.sql"));
    const liste = await sup.query(metin.slice(0, metin.indexOf("DO $$")));
    (liste.find ? liste : [liste]).forEach((x) => x.rows?.filter((s) => s.durum).forEach((s) => console.log(`  ${s.durum} ${s.kontrol}: ${s.ayrinti}`)));
  } else {
    bypassSonuc?.rows.forEach((s) => console.log(`  ${s.durum} ${s.kontrol}: ${s.ayrinti}`));
    console.log("temiz");
  }

  bolum("yetki-matrisi.sql");
  const metin2 = sqlHazirla(oku("db/kontrol/yetki-matrisi.sql"));
  const r2 = await sup.query(metin2).then((x) => x, (e) => e);
  if (r2 instanceof Error) {
    basarisiz++;
    console.log("BAŞARISIZ:", r2.message);
    const liste = await sup.query(metin2.slice(0, metin2.indexOf("DO $$"))).catch(() => []);
    (Array.isArray(liste) ? liste : [liste]).forEach((x) => x.fields?.some((f) => f.name === "kural") && x.rows.forEach((s) => console.log(`  ${s.kural}: ${s.ayrinti}`)));
  } else {
    const matris = r2.find((x) => x.fields?.some((f) => f.name === "yetki"));
    console.log(`temiz (${matris.rows.length} rol-tablo satırı)`);
    const roller = {};
    for (const s of matris.rows) (roller[s.rol] ??= []).push(`${s.tablo}: ${s.yetki}`);
    let md = "# Yetki Matrisi (otomatik üretildi)\n\nKaynak: `db/kontrol/yetki-matrisi.sql`, `scripts/dev/kontrol-calistir.mjs`. S=SELECT, I=INSERT, U=UPDATE, D=DELETE. Tabloda görünmeyen rol-tablo çifti = yetki YOK.\n";
    for (const [rol, satirlar] of Object.entries(roller)) md += `\n## ${rol} (${satirlar.length} tablo/görünüm)\n\n| Tablo | Yetki |\n|---|---|\n${satirlar.map((x) => `| ${x.split(": ")[0]} | ${x.split(": ")[1]} |`).join("\n")}\n`;
    fs.writeFileSync(path.join(KOK, "docs/yetki-matrisi.md"), md, "utf8");
  }
  await sup.end();

  bolum("yetkisiz tablolara yazan tetikleyici/RPC'ler (gerçek yazma testi)");
  {
    const r = await yetkisizRaporu(duzenek);
    r.sonuc.forEach((x) => console.log(`  ${x.durum} ${x.ad} [${x.tablo}] — ${x.ayrinti}`));
    if (r.basarisiz) basarisiz++;
  }

  bolum("anonim self-servis kayıt testi");
  const a = await anonimKayitTesti(duzenek);
  a.forEach((s) => console.log(`  ${s.durum} ${s.ad}${s.ayrinti ? " — " + s.ayrinti : ""}`));
  if (a.some((s) => s.durum === "BAŞARISIZ")) basarisiz++;

  bolum("DEFINER duman testi");
  const d = await definerDumanTesti(duzenek);
  fs.writeFileSync(path.join(KOK, "db/kontrol/definer-duman-sonuc.json"), JSON.stringify(d, null, 1) + "\n", "utf8");
  const ozet = {};
  for (const s of d.sonuclar) ozet[s.sonuc] = (ozet[s.sonuc] ?? 0) + 1;
  console.log("özet:", JSON.stringify(ozet));
  d.sonuclar.filter((s) => s.sonuc === "SIZINTI").forEach((s) => console.log(`  SIZINTI ${s.imza}: ${s.ayrinti}`));
  if (ozet.SIZINTI) basarisiz++;
} finally {
  await duzenek.durdur();
}
console.log(basarisiz ? `\n${basarisiz} bölüm BAŞARISIZ` : "\nTüm kontroller geçti");
process.exit(basarisiz ? 1 : 0);
