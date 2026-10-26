// Referans veritabanından (172 migration'ın Supabase-uyumluluk katmanıyla uygulandığı geçici Postgres)
// düz Postgres temel şemasını üretir. Çıktı: db/migrations/0002_temel_sema.sql + db/seed/0001_referans_veri.sql
//
// Kullanım:  REF_DB_URL=postgres://... node db/arac/sema-uret.mjs
// Üretim kuralları ve eşleme tablosu: docs/sema-esleme.md
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.REF_DB_URL;
if (!url) throw new Error("REF_DB_URL gerekli");
const cl = new pg.Client({ connectionString: url });
await cl.connect();
const q = async (sql, p = []) => (await cl.query(sql, p)).rows;

// ---- Eşleme sabitleri ----
const ROL = { anon: "klinik_anonim", authenticated: "klinik_uygulama" };
// Taşımada alınmayan nesneler (kalıntılar): bkz. sema-esleme.md "Alınmayanlar".
const ATLANAN_TABLO = new Set(["audit_log_eski", "oturum_kilidi"]);
const ATLANAN_FONKSIYON = new Set([
  "_gecici_rol_probe", "current_musteri_id", "oturum_anahtari_yenile",
  // Bağlam fonksiyonları yeniden yazıldı (app.user_id / app.tenant_id): 0001 ve db/arac/baglam-fonksiyonlari.sql
  "current_klinik_id", "current_rol", "is_super_admin", "current_hasta_id",
]);
// FORCE RLS dışında kalan, tenant'sız tablolar (gerekçe: sema-esleme.md)
const FORCE_ISTISNA = new Set([
  "resmi_tatil", "pozisyon_sablonlari", "olcek_tanimi", "egzersiz_kutuphanesi", "hiz_siniri_sayac",
]);
// Yalnız sistem (bakim_rolu) çağırabilir; auth.role()='service_role' kabulleri sistem_baglami()'na çevrilir
const KOMUT = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };

const out = [];
const e = (s = "") => out.push(s);
const ad = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`);

// ---- Metin dönüşümü (fonksiyon gövdesi, politika, varsayılan) ----
function donustur(t) {
  if (t == null) return t;
  return t
    .replace(/auth\.uid\(\)/g, "app_kullanici_id()")
    .replace(/\(?\s*auth\.role\(\)\s*=\s*'service_role'\s*\)?/g, "sistem_baglami()")
    .replace(/auth\.users/g, "kimlik_kullanici")
    .replace(/u\.email/g, "u.eposta")
    .replace(/\bTO anon\b/g, "TO klinik_anonim")
    .replace(/\bTO authenticated\b/g, "TO klinik_uygulama");
}

// ---- Eklentiler / başlık ----
e("-- OTOMATİK ÜRETİLDİ: db/arac/sema-uret.mjs — elle düzenleme; kuralı değiştir, yeniden üret.");
e("-- Kaynak: 172 migration (supabase/migrations) + supabase/bekleyen/20261003110000_puantaj_pin_kaldir.sql");
e("-- Çalıştıran rol: klinik_sahip (scripts/db-kur.ps1). Önce 0001_kimlik_ve_baglam.sql uygulanmış olmalı.");
e("SET check_function_bodies = off;");
e("SET search_path = public, extensions;");
e("");

// ---- Enum'lar ----
for (const t of await q(`select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) l
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  where t.typnamespace='public'::regnamespace group by t.typname order by min(t.oid)`)) {
  e(`CREATE TYPE ${ad(t.typname)} AS ENUM (${t.l.map((x) => `'${x.replace(/'/g, "''")}'`).join(", ")});`);
}
e("");

// ---- Bağlam fonksiyonları (elle yazıldı; enum'lardan sonra, tablolardan önce) ----
e(fs.readFileSync("db/arac/baglam-fonksiyonlari.sql", "utf8"));
e("");

// ---- Tablolar ----
const tablolar = await q(`select c.oid, c.relname, c.relkind, c.relrowsecurity, pg_get_partkeydef(c.oid) pk
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not c.relispartition
  order by c.oid`);
const tabloAdlari = tablolar.filter((t) => !ATLANAN_TABLO.has(t.relname));
const fonks = await q(`select p.oid, p.proname, pg_get_functiondef(p.oid) def, p.prosecdef, p.proacl
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by p.oid`);
const ozFonksAdlari = fonks.filter((f) => !ATLANAN_FONKSIYON.has(f.proname)).map((f) => f.proname);
const fonksRe = new RegExp(`\\b(${[...new Set(ozFonksAdlari)].join("|")})\\s*\\(`);

// Üretilmiş (GENERATED) kolonların kullandığı fonksiyonlar tablolardan ÖNCE yaratılır (skaler, tabloya bağımlı değil).
const uretilmisIfadeler = (await q(`select pg_get_expr(d.adbin,d.adrelid) x from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where a.attgenerated<>'' and d.adrelid in (select oid from pg_class where relnamespace='public'::regnamespace)`)).map((r) => r.x).join(" ");
const erkenFonksiyonlar = new Set(ozFonksAdlari.filter((n) => new RegExp("(^|[^a-z_0-9])" + n + "[ ]*[(]").test(uretilmisIfadeler)));
// Geçişli bağımlılık: erken fonksiyonların çağırdığı fonksiyonlar da erken yaratılır.
for (let degisti = true; degisti; ) {
  degisti = false;
  for (const f of fonks) {
    if (!erkenFonksiyonlar.has(f.proname)) continue;
    for (const n of ozFonksAdlari) {
      if (n !== f.proname && !erkenFonksiyonlar.has(n) && new RegExp("(^|[^a-z_0-9])" + n + "[ ]*[(]").test(f.def)) { erkenFonksiyonlar.add(n); degisti = true; }
    }
  }
}
if (erkenFonksiyonlar.size) e("-- ===== Üretilmiş kolonların kullandığı fonksiyonlar (tablolardan önce) =====");
for (const f of fonks) {
  if (!erkenFonksiyonlar.has(f.proname)) continue;
  e(donustur(f.def).replace(/^CREATE OR REPLACE FUNCTION/, "CREATE FUNCTION") + ";");
  e("");
}
const ertelenenVarsayilan = [];

for (const t of tabloAdlari) {
  const kolonlar = await q(`select a.attname, format_type(a.atttypid,a.atttypmod) tip, a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid) varsayilan, a.attgenerated, a.attidentity
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=$1 and a.attnum>0 and not a.attisdropped order by a.attnum`, [t.oid]);
  e(`CREATE TABLE ${ad(t.relname)} (`);
  e(kolonlar.map((k) => {
    let s = `  ${ad(k.attname)} ${k.tip}`;
    if (k.attgenerated === "s") s += ` GENERATED ALWAYS AS (${donustur(k.varsayilan)}) STORED`;
    else if (k.varsayilan != null) {
      if (fonksRe.test(k.varsayilan)) ertelenenVarsayilan.push({ t: t.relname, k: k.attname, v: donustur(k.varsayilan) });
      else s += ` DEFAULT ${donustur(k.varsayilan)}`;
    }
    if (k.attnotnull) s += " NOT NULL";
    return s;
  }).join(",\n"));
  e(`)${t.pk ? ` PARTITION BY ${t.pk}` : ""};`);
  e("");
}
// Varsayılan bölüm (aylık bölümler db-kur sırasında audit_log_bolum_olustur ile açılır)
e("CREATE TABLE audit_log_varsayilan PARTITION OF audit_log DEFAULT;");
e("");

// ---- Fonksiyonlar (tablolardan sonra; gövde doğrulaması kapalı) ----
e("-- ===== Fonksiyonlar =====");
for (const f of fonks) {
  if (ATLANAN_FONKSIYON.has(f.proname) || erkenFonksiyonlar.has(f.proname)) continue;
  let def = donustur(f.def);
  e(def.replace(/^CREATE OR REPLACE FUNCTION/, "CREATE FUNCTION") + ";");
  e("");
}
for (const d of ertelenenVarsayilan) e(`ALTER TABLE ${ad(d.t)} ALTER COLUMN ${ad(d.k)} SET DEFAULT ${d.v};`);
e("");

// ---- Kısıtlar: önce PK/UNIQUE/CHECK/EXCLUDE, sonra FK ----
e("-- ===== Kısıtlar =====");
const kisitlar = await q(`select c.conrelid::regclass::text t, c.conname, c.contype, pg_get_constraintdef(c.oid) def
  from pg_constraint c join pg_class r on r.oid=c.conrelid
  where r.relnamespace='public'::regnamespace and not r.relispartition and c.conparentid=0
  order by case c.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 when 'x' then 4 else 5 end, c.oid`);
const atlanir = (t) => ATLANAN_TABLO.has(t.replace(/"/g, ""));
for (const k of kisitlar) {
  if (atlanir(k.t) || k.t.startsWith("audit_log_")) continue;
  if (k.contype === "n") continue;
  e(`ALTER TABLE ${k.t} ADD CONSTRAINT ${ad(k.conname)} ${donustur(k.def)};`);
}
e("");

// ---- Görünümler ----
e("-- ===== Görünümler =====");
for (const v of await q(`select c.oid, c.relname, c.relkind, pg_get_viewdef(c.oid, true) def, c.reloptions
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m') order by c.oid`)) {
  const opt = v.reloptions && v.reloptions.length ? ` WITH (${v.reloptions.join(", ")})` : "";
  const baslik = v.relkind === "m" ? "CREATE MATERIALIZED VIEW" : "CREATE VIEW";
  e(`${baslik} ${ad(v.relname)}${opt} AS\n${donustur(v.def).replace(/;\s*$/, "")}${v.relkind === "m" ? "\nWITH NO DATA" : ""};`);
  e("");
}

// ---- İndeksler (kısıt değil; bölüm indeksleri hariç) ----
e("-- ===== İndeksler =====");
for (const i of await q(`select i.indexrelid, pg_get_indexdef(i.indexrelid) def, c.relname tablo
  from pg_index i join pg_class c on c.oid=i.indrelid
  where c.relnamespace='public'::regnamespace and not c.relispartition
  and not exists (select 1 from pg_constraint k where k.conindid=i.indexrelid)
  and not exists (select 1 from pg_inherits h where h.inhrelid=i.indexrelid)
  and c.relkind in ('r','p','m') order by i.indexrelid`)) {
  if (ATLANAN_TABLO.has(i.tablo)) continue;
  e(donustur(i.def).replace(/^CREATE (UNIQUE )?INDEX/, "CREATE $1INDEX").replace(/ ON public\./, " ON ") + ";");
}
e("");

// ---- Tetikleyiciler ----
e("-- ===== Tetikleyiciler =====");
for (const t of await q(`select c.relname, pg_get_triggerdef(tr.oid) def from pg_trigger tr
  join pg_class c on c.oid=tr.tgrelid where c.relnamespace='public'::regnamespace and not tr.tgisinternal
  and tr.tgparentid=0 and not c.relispartition order by tr.oid`)) {
  if (ATLANAN_TABLO.has(t.relname) || t.relname.startsWith("audit_log_")) continue;
  e(donustur(t.def).replace(/ ON public\./, " ON ") + ";");
}
e("");

// ---- RLS: etkin + FORCE + politikalar ----
e("-- ===== Satır düzeyi güvenlik =====");
const forceTablolar = [];
for (const t of tabloAdlari) {
  const klinikIdVar = (await q(`select 1 from pg_attribute where attrelid=$1 and attname='klinik_id' and not attisdropped`, [t.oid])).length > 0;
  if (t.relrowsecurity) e(`ALTER TABLE ${ad(t.relname)} ENABLE ROW LEVEL SECURITY;`);
  const force = t.relrowsecurity && !FORCE_ISTISNA.has(t.relname) && (klinikIdVar || t.relname === "klinik");
  if (force) { e(`ALTER TABLE ${ad(t.relname)} FORCE ROW LEVEL SECURITY;`); forceTablolar.push({ ad: t.relname, klinikIdVar }); }
}
e("");
const anonTablo = new Map(); // tablo -> Set(komut)
const anonFonksiyon = new Set();
for (const p of await q(`select c.relname, p.polname, p.polcmd, p.polpermissive,
    array(select rolname::text from pg_roles r where r.oid = any(p.polroles)) roller,
    p.polroles = '{0}' herkes,
    pg_get_expr(p.polqual,p.polrelid) qual, pg_get_expr(p.polwithcheck,p.polrelid) wchk
  from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by p.oid`)) {
  if (ATLANAN_TABLO.has(p.relname)) continue;
  let roller = p.herkes ? "PUBLIC" : p.roller.map((r) => ROL[r] ?? r).filter((r) => r !== "service_role").join(", ");
  if (!roller) continue; // yalnız service_role/postgres içindi
  const cmd = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", "*": "ALL" }[p.polcmd];
  const anonMi = p.roller.includes("anon"); // yalnız AÇIKÇA anon'a verilenler; PUBLIC politikaları anon tablo yetkisi doğurmaz
  if (anonMi) {
    const set = anonTablo.get(p.relname) ?? new Set();
    (p.polcmd === "*" ? ["r", "a", "w", "d"] : [p.polcmd]).forEach((c) => set.add(KOMUT[c]));
    anonTablo.set(p.relname, set);
    for (const m of ((p.qual ?? "") + (p.wchk ?? "")).matchAll(/\b([a-z_]+)\(/g)) anonFonksiyon.add(m[1]);
  }
  let s = `CREATE POLICY ${ad(p.polname)} ON ${ad(p.relname)} AS ${p.polpermissive ? "PERMISSIVE" : "RESTRICTIVE"} FOR ${cmd} TO ${roller}`;
  if (p.qual) s += ` USING (${donustur(p.qual)})`;
  if (p.wchk) s += ` WITH CHECK (${donustur(p.wchk)})`;
  e(s + ";");
}
e("");
// FORCE altında DEFINER fonksiyonlar/tetikleyiciler (sahip: klinik_sahip) YALNIZ aktif tenant'ın satırlarına dokunabilir.
e("-- Sahip politikası: FORCE altında klinik_sahip (DEFINER fonksiyon/tetikleyici sahibi) da yalnız aktif tenant'ı görür; tenant'lar arası erişim YOK.");
for (const t of forceTablolar) {
  const koşul = t.ad === "klinik" ? "id = current_klinik_id()" : "klinik_id = current_klinik_id()";
  e(`CREATE POLICY sahip_aktif_tenant ON ${ad(t.ad)} AS PERMISSIVE FOR ALL TO klinik_sahip USING (${koşul}) WITH CHECK (${koşul});`);
}
e("");

// ---- Yetkiler ----
e("-- ===== Yetkiler =====");
e("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;");
e("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;");
for (const t of tabloAdlari) {
  const acl = await q(`select (aclexplode(c.relacl)).grantee::regrole::text g, (aclexplode(c.relacl)).privilege_type p
    from pg_class c where c.oid=$1`, [t.oid]);
  const uyg = acl.filter((x) => x.g === "authenticated").map((x) => x.p);
  if (uyg.length) e(`GRANT ${uyg.join(", ")} ON ${ad(t.relname)} TO klinik_uygulama;`);
  const kolAcl = await q(`select a.attname, (aclexplode(a.attacl)).grantee::regrole::text g, (aclexplode(a.attacl)).privilege_type p
    from pg_attribute a where a.attrelid=$1 and a.attacl is not null and not a.attisdropped`, [t.oid]);
  const gruplu = {};
  for (const k of kolAcl.filter((x) => x.g === "authenticated")) (gruplu[k.p] ??= []).push(k.attname);
  for (const [p, kols] of Object.entries(gruplu)) e(`GRANT ${p} (${kols.map(ad).join(", ")}) ON ${ad(t.relname)} TO klinik_uygulama;`);
  const an = anonTablo.get(t.relname);
  if (an && an.size) e(`GRANT ${[...an].join(", ")} ON ${ad(t.relname)} TO klinik_anonim;`);
}
for (const v of await q(`select c.relname, (aclexplode(c.relacl)).grantee::regrole::text g, (aclexplode(c.relacl)).privilege_type p
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m')`)) {
  if (v.g === "authenticated") e(`GRANT ${v.p} ON ${ad(v.relname)} TO klinik_uygulama;`);
}
// Fonksiyonlar: authenticated EXECUTE'u olanlar -> klinik_uygulama; anon yalnız açıkça verilenler + anon politikalarının kullandıkları
const anonAcik = new Set(["hasta_qr_self_servis_mi", "klinik_qr_bilgisi_getir", "randevu_anket_uygun_mu", "seans_degerlendirme_baglam_getir", "hiz_siniri_kullan", "qr_kodu_aktif_mi"]);
const bakimAcik = new Set(["audit_log_bolum_olustur"]);
const sistemFonks = [];
for (const f of fonks) {
  if (ATLANAN_FONKSIYON.has(f.proname)) continue;
  const imza = (await q(`select p.oid::regprocedure::text s from pg_proc p where p.oid=$1`, [f.oid]))[0].s.replace(/^public\./, "");
  const g = (await q(`select (aclexplode(p.proacl)).grantee::regrole::text g from pg_proc p where p.oid=$1`, [f.oid])).map((x) => x.g);
  if (g.includes("authenticated")) e(`GRANT EXECUTE ON FUNCTION ${imza} TO klinik_uygulama;`);
  else if (g.includes("service_role")) sistemFonks.push(imza);
  if (f.proname === "hiz_siniri_kullan") e(`GRANT EXECUTE ON FUNCTION ${imza} TO klinik_uygulama;`);
  if (anonAcik.has(f.proname) || anonFonksiyon.has(f.proname)) e(`GRANT EXECUTE ON FUNCTION ${imza} TO klinik_anonim;`);
  if (bakimAcik.has(f.proname)) e(`GRANT EXECUTE ON FUNCTION ${imza} TO bakim_rolu;`);
}
e("");

fs.mkdirSync("db/migrations", { recursive: true });
fs.writeFileSync("db/migrations/0002_temel_sema.sql", out.join("\n"), "utf8");

// ---- Tohum (referans) veri: tenant'sız kataloglar ----
const tohum = ["resmi_tatil", "egzersiz_kutuphanesi", "pozisyon_sablonlari", "olcek_tanimi"];
const so = ["-- OTOMATİK ÜRETİLDİ (db/arac/sema-uret.mjs): tenant'sız referans kataloglar.", "SET search_path = public, extensions;"];
for (const tb of tohum) {
  const rows = await q(`select to_jsonb(t) j from ${tb} t order by 1`);
  if (!rows.length) continue;
  so.push(`INSERT INTO ${tb} SELECT * FROM jsonb_populate_recordset(NULL::${tb}, $j$${JSON.stringify(rows.map((r) => r.j))}$j$::jsonb);`);
}
fs.mkdirSync("db/seed", { recursive: true });
fs.writeFileSync("db/seed/0001_referans_veri.sql", so.join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  tablo: tabloAdlari.length, fonksiyon: ozFonksAdlari.length, force: forceTablolar.length,
  ertelenenVarsayilan: ertelenenVarsayilan.length, anonTablo: [...anonTablo.keys()], sistemFonks,
}, null, 1));
await cl.end();
