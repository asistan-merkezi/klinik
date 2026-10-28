// Koddaki veritabanı sorgularını tarar: hangi tablo/görünüm hangi işlemle (SELECT/INSERT/UPDATE/DELETE) kullanılıyor.
// Çıktı: db/arac/kod-kullanimi.json (ham kayıtlar; şema üretici bunu katalogla çözümleyip yetkilere çevirir).
// Kullanım:  node scripts/dev/kullanim-tara.mjs      (repo kökünden)
// Sınır: statik tarama. Değişkenle verilen tablo adları ve zincirleme dışı kullanım "belirsiz" listesine düşer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARANACAK = ["app", "lib", "components", "proxy.ts"];
const ATLA = new Set(["node_modules", ".next", "dev"]);

function dosyalar(yol, cikti = []) {
  const tam = path.join(KOK, yol);
  if (!fs.existsSync(tam)) return cikti;
  const st = fs.statSync(tam);
  if (st.isFile()) { if (/[.]tsx?$/.test(yol)) cikti.push(yol); return cikti; }
  for (const ad of fs.readdirSync(tam)) if (!ATLA.has(ad)) dosyalar(path.join(yol, ad), cikti);
  return cikti;
}

// Seçim metnindeki gömülü ilişkileri (embed) ayrıştırır: ust.ad(alt...) -> [{ust, ad, alias}]
function gomulu(metin, kok) {
  const sonuc = [];
  const yigin = [kok];
  let jeton = "";
  const kapat = () => { const j = jeton.trim(); jeton = ""; return j; };
  for (const ch of metin) {
    if (ch === "(") {
      const j = kapat();
      // alias:ad!ipucu  veya ad!inner
      const [onYarim, ...ipucu] = j.split("!");
      const [a1, a2] = onYarim.includes(":") ? onYarim.split(":") : [null, onYarim];
      const ad = (a2 ?? "").trim();
      const girdi = { ust: yigin[yigin.length - 1], ad, alias: a1, ipucu: ipucu.filter((x) => x !== "inner" && x !== "left") };
      sonuc.push(girdi);
      yigin.push(ad);
    } else if (ch === ")") { kapat(); yigin.pop(); }
    else if (ch === ",") { kapat(); }
    else { jeton += ch; }
  }
  return sonuc;
}

// ---- Drizzle kullanımı (sema.<tablo>) ----
// lib/db/sema/schema.ts: camelCase ad -> gerçek tablo/görünüm adı
const semaMetni = fs.readFileSync(path.join(KOK, "lib/db/sema/schema.ts"), "utf8");
const camelTablo = new Map();
for (const m of semaMetni.matchAll(/export const (\w+) = (?:pgTable|pgView|pgMaterializedView)\(\s*["']([a-z_0-9]+)["']/g)) camelTablo.set(m[1], m[2]);

function drizzleKayitlari(kaynak, yol, satirNo) {
  const sonuc = [];
  // Tablo başvurusu: sema.<ad> ve ARDINDAN nokta YOK (sema.klinik.id gibi kolon başvuruları ve $inferInsert tür başvuruları hariç)
  for (const m of kaynak.matchAll(/(?<![A-Za-z0-9_])sema[.]([A-Za-z0-9_]+)(?![A-Za-z0-9_.])/g)) {
    const tablo = camelTablo.get(m[1]);
    if (!tablo) continue;
    const once = kaynak.slice(Math.max(0, m.index - 40), m.index).replace(/\s+/g, " ");
    const sonra = kaynak.slice(m.index, m.index + 700);
    const zincirSonu = sonra.search(/;\s*\n|\n\s*\n/);
    const zincir = zincirSonu === -1 ? sonra : sonra.slice(0, zincirSonu);
    const op = new Set();
    if (/[.](insert)\(\s*$/.test(once)) {
      op.add("INSERT");
      if (/[.]onConflictDo(Update|Nothing)\(/.test(zincir)) { op.add("UPDATE"); op.add("SELECT"); }
      if (/[.]returning\(/.test(zincir)) op.add("SELECT");
    } else if (/[.]update\(\s*$/.test(once)) { op.add("UPDATE"); op.add("SELECT"); }
    else if (/[.]delete\(\s*$/.test(once)) { op.add("DELETE"); op.add("SELECT"); }
    else op.add("SELECT"); // from(...), *Join(...), alt sorgu vb.
    sonuc.push({ dosya: yol.split(path.sep).join("/"), satir: satirNo(m.index), tablo, islemler: [...op], gomulu: [] });
  }
  return sonuc;
}

const kayitlar = [];
const belirsiz = [];
const rpc = new Map();

for (const yol of TARANACAK.flatMap((y) => dosyalar(y))) {
  const kaynak = fs.readFileSync(path.join(KOK, yol), "utf8");
  const satirNo = (idx) => kaynak.slice(0, idx).split("\n").length;
  // .from("tablo")
  for (const m of kaynak.matchAll(/[.]from\(\s*(["'`])([a-z_0-9]+)\1\s*\)/g)) {
    const onceki = kaynak.slice(Math.max(0, m.index - 60), m.index);
    if (/storage\s*$/.test(onceki.replace(/\s+/g, " ").trimEnd()) || /storage\s*[.]?\s*$/.test(onceki)) continue; // Storage bucket'ı, tablo değil
    const pencere = kaynak.slice(m.index + m[0].length, m.index + m[0].length + 900);
    // Zincirin sonu: ilk ';' veya iki ardışık boş satır
    const son1 = pencere.search(/;|\n\s*\n/);
    const sonraki = pencere.search(/[.]from\(|[.]rpc\(/); // Promise.all içindeki bir sonraki sorgu bu zincire karışmasın
    const kesim = [son1, sonraki].filter((x) => x >= 0);
    const zincir = kesim.length ? pencere.slice(0, Math.min(...kesim)) : pencere;
    const op = new Set();
    if (/[.]insert\(/.test(zincir)) op.add("INSERT");
    if (/[.]update\(/.test(zincir)) op.add("UPDATE");
    if (/[.]delete\(/.test(zincir)) op.add("DELETE");
    if (/[.]upsert\(/.test(zincir)) { op.add("INSERT"); op.add("UPDATE"); }
    // select: açık .select(...) veya yazma + select (RETURNING). Hiç yazma yoksa varsayılan select.
    const yazma = op.size > 0;
    if (!yazma || /[.]select\(/.test(zincir)) op.add("SELECT");
    // upsert/update/delete koşul okur (eq vb. WHERE) -> SELECT gerekir (WHERE kolon okuması)
    if (op.has("UPDATE") || op.has("DELETE")) op.add("SELECT");
    const gom = [];
    for (const sm of zincir.matchAll(/[.]select\(\s*(["'`])([^"'`]*)\1/g)) gom.push(...gomulu(sm[2], m[2]));
    kayitlar.push({ dosya: yol.replace(/\\/g, "/"), satir: satirNo(m.index), tablo: m[2], islemler: [...op], gomulu: gom });
  }
  kayitlar.push(...drizzleKayitlari(kaynak, yol, satirNo));
  // Değişkenle verilen .from(
  for (const m of kaynak.matchAll(/[.]from\(\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*[,)]/g)) {
    if (/Array$|Buffer$|Object$|Uint8Array$/.test(kaynak.slice(Math.max(0, m.index - 12), m.index))) continue;
    belirsiz.push({ dosya: yol.replace(/\\/g, "/"), satir: satirNo(m.index), ifade: m[0].trim() });
  }
  // rpc(tx, "ad" (lib/db/rpc.ts)
  for (const m of kaynak.matchAll(/(?:[.]rpc\(|(?<![A-Za-z0-9_.])rpc(?:<[\s\S]{0,400}?>)?\(\s*[A-Za-z_][A-Za-z0-9_.]*\s*,)\s*(["'`])([a-z_0-9]+)\1/g)) {
    const liste = rpc.get(m[2]) ?? [];
    liste.push(`${yol.replace(/\\/g, "/")}:${satirNo(m.index)}`);
    rpc.set(m[2], liste);
  }
}

const cikti = { uretim: "scripts/dev/kullanim-tara.mjs", kayitSayisi: kayitlar.length, kayitlar, belirsiz, rpc: Object.fromEntries(rpc) };
fs.writeFileSync(path.join(KOK, "db/arac/kod-kullanimi.json"), JSON.stringify(cikti, null, 1) + "\n", "utf8");
console.log(JSON.stringify({ kayit: kayitlar.length, tablo: new Set(kayitlar.map((k) => k.tablo)).size, rpc: rpc.size, belirsiz }, null, 1));
