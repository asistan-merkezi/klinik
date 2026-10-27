// drizzle-kit pull çıktısını (lib/db/sema/schema.ts) uygulama için kullanılabilir hâle getirir:
//  1) `.default(')` hatası (boş string varsayılanı) düzeltilir,
//  2) foreignKey(...) blokları silinir (döngüsel tip çıkarımı TS7022 üretir; FK'ler veritabanında zaten var, ilişkiler relations.ts'te),
//  3) pgPolicy(...) blokları silinir (RLS politikaları veritabanında ve db/migrations'ta; sorgu katmanında gerekmez),
//  4) bilinmeyen tür unknown(...) -> tstzrange customType.
// Kullanım: node scripts/dev/sema-duzelt.mjs   (drizzle-cek.mjs sonunda otomatik çalışır)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EL_ILE_EKLENEN = `
/** EL İLE EKLENDİ (scripts/dev/sema-duzelt.mjs): drizzle-kit bölümlü (PARTITION BY RANGE) ana tabloyu üretmiyor. Yazma/okuma ana tablo üzerinden yapılır. */
export const auditLog = pgTable("audit_log", {
	id: uuid().defaultRandom().notNull(),
	klinikId: uuid("klinik_id"),
	kullaniciId: uuid("kullanici_id"),
	eylem: text().notNull(),
	hedefTablo: text("hedef_tablo"),
	hedefId: uuid("hedef_id"),
	detay: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
})
`;

export function semaDuzelt(metin) {
  let s = metin.replace(/\r\n/g, "\n").split(".default(')").join('.default("")');
  // foreignKey({ ... }) ve ardındaki .onDelete()/.onUpdate() zinciri
  s = s.replace(/\n\tforeignKey\(\{[\s\S]*?\n\t\t\}\)(?:\.on(?:Delete|Update)\("[a-z ]+"\))*,?/g, "");
  // pgPolicy("ad", { ... })
  s = s.replace(/\n\tpgPolicy\("[^"]+", \{[\s\S]*?\}\),?(?=\n)/g, "");
  if (s.includes("unknown(")) {
    s = s.split("unknown(").join("tstzrange(");
    s = s.replace('import { sql } from "drizzle-orm"', 'import { sql } from "drizzle-orm"\nimport { customType } from "drizzle-orm/pg-core"\n\n/** drizzle-kit tanımadığı türü unknown yazar; veritabanındaki tür tstzrange (randevu.zaman_araligi, üretilmiş kolon). */\nconst tstzrange = customType<{ data: string }>({ dataType: () => "tstzrange" })');
  }
  if (!s.includes("export const auditLog =")) s += EL_ILE_EKLENEN;
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const yol = path.join(KOK, "lib/db/sema/schema.ts");
  fs.writeFileSync(yol, semaDuzelt(fs.readFileSync(yol, "utf8")), "utf8");
  for (const f of fs.readdirSync(path.join(KOK, "lib/db/sema"))) if (f.endsWith(".sql") || f === "meta") fs.rmSync(path.join(KOK, "lib/db/sema", f), { recursive: true, force: true });
  console.log("lib/db/sema/schema.ts düzeltildi");
}
