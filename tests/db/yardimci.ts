// Veritabanı testleri için ortak yardımcılar. Bağlantı bilgileri globalSetup'tan (inject) gelir; ortam değişkenleri uygulamayla AYNI adları kullanır.
import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import pg from "pg";
import { tenantBaglamiUret, kullaniciBaglamiUret } from "@/lib/db/baglam-uretici";
import { hastaHesabiOlustur, personelHesabiOlustur, type PersonelRolu } from "@/lib/auth/hesap";

export const SUPER_SIFRE = "yerel-deneme";

export function ortamKur(): { port: number; ids: Record<string, Record<string, string>> } {
  const port = inject("dbPort");
  process.env.DATABASE_URL = `postgres://klinik_uygulama:u-deneme@localhost:${port}/klinik`;
  process.env.KIMLIK_DATABASE_URL = `postgres://kimlik_rolu:k-deneme@localhost:${port}/klinik`;
  process.env.BAKIM_DATABASE_URL = `postgres://bakim_rolu:b-deneme@localhost:${port}/klinik`;
  return { port, ids: inject("dbIds") };
}

export async function superBaglan(): Promise<pg.Client> {
  const c = new pg.Client({ host: "localhost", port: inject("dbPort"), user: "postgres", password: SUPER_SIFRE, database: "klinik" });
  await c.connect();
  return c;
}

/** Süper kullanıcı oturumunda ama tenant bağlamıyla (FORCE RLS + sahip politikası gereği) yazar. */
export async function tenantdaCalistir<T>(klinikId: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = await superBaglan();
  try {
    await c.query("BEGIN");
    await c.query("select set_config('app.tenant_id', $1, true)", [klinikId]);
    const s = await fn(c);
    await c.query("COMMIT");
    return s;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

let sayac = 0;
export const benzersizTelefon = () => `5${String(Date.now()).slice(-5)}${String(++sayac).padStart(4, "0")}`.slice(0, 10).padEnd(10, "0");

export async function personelKur(g: { klinikId: string; rol: PersonelRolu; telefon?: string; eposta?: string; geciciSifre?: string }) {
  const id = randomUUID();
  const telefon = g.telefon ?? benzersizTelefon();
  const eposta = g.eposta ?? `p-${id}@deneme.test`;
  const hesap = await personelHesabiOlustur({ id, eposta, ad: `Personel ${id.slice(0, 4)}`, telefon, rol: g.rol, klinikId: g.klinikId, geciciSifre: g.geciciSifre });
  await tenantdaCalistir(g.klinikId, (c) => c.query("insert into kullanici(id, klinik_id, rol, ad_soyad, telefon) values ($1, $2, $3, $4, $5)", [id, g.klinikId, g.rol, `Personel ${id.slice(0, 4)}`, telefon]));
  return { id, eposta, telefon, sifre: hesap.geciciSifre };
}

export async function hastaKur(g: { klinikId: string; telefon?: string; geciciSifre?: string }) {
  const hastaId = randomUUID();
  const telefon = g.telefon ?? benzersizTelefon();
  await tenantdaCalistir(g.klinikId, (c) => c.query("insert into hasta(id, klinik_id, ad_soyad, telefon) values ($1, $2, $3, $4)", [hastaId, g.klinikId, `Hasta ${hastaId.slice(0, 4)}`, telefon]));
  const hesap = await hastaHesabiOlustur({ hastaId, klinikId: g.klinikId, ad: "Hasta", telefon, geciciSifre: g.geciciSifre });
  await tenantdaCalistir(g.klinikId, (c) => c.query("insert into hasta_kullanici(id, hasta_id) values ($1, $2)", [hesap.id, hastaId]));
  return { kullaniciId: hesap.id, hastaId, telefon, sifre: hesap.geciciSifre };
}

/** Set-Cookie listesinden istek Cookie başlığı üretir. */
export function cerezBasligi(setCookies: string[]): Headers {
  const h = new Headers();
  h.set("cookie", setCookies.map((s) => s.split(";")[0]).join("; "));
  return h;
}

export const basliklar = (ip = "203.0.113.7") => new Headers({ "x-real-ip": ip, "user-agent": "vitest" });

/** drizzle hataları "Failed query" ile sarar; asıl PostgreSQL mesajı `cause` zincirindedir. */
export function hataZinciri(e: unknown): string {
  const parcalar: string[] = [];
  for (let x: unknown = e; x instanceof Error; x = (x as Error & { cause?: unknown }).cause) parcalar.push(x.message);
  return parcalar.join(" | ");
}

/** Promise'in reddedilmesini ve hata zincirinde desenin geçmesini bekler. */
export async function reddedilmeli(p: Promise<unknown>, desen: RegExp = /./): Promise<string> {
  try {
    await p;
  } catch (e) {
    const m = hataZinciri(e);
    if (!desen.test(m)) throw new Error(`Beklenen hata deseni ${desen} bulunamadı: ${m}`);
    return m;
  }
  throw new Error("İşlem başarılı oldu, reddedilmesi bekleniyordu");
}

/** db/kontrol testlerinin beklediği düzenek nesnesi (testKumesiKur çıktısıyla aynı şekil) — çalışan test kümesine bağlanır. */
export function duzenekOlustur() {
  const { port, ids } = ortamKur();
  const parolalar: Record<string, string> = { klinik_uygulama: "u-deneme", kimlik_rolu: "k-deneme", bakim_rolu: "b-deneme", klinik_yedek: "y-deneme" };
  const baglan = async (kullanici: string, sifre: string) => {
    const c = new pg.Client({ host: "localhost", port, user: kullanici, password: sifre, database: "klinik" });
    await c.connect();
    return c;
  };
  return { ids, baglanRol: (rol: string) => baglan(rol, parolalar[rol] ?? "yok"), baglanSuper: () => baglan("postgres", SUPER_SIFRE) };
}

/** Test bağlamı üreticileri (üretim kodunda yalnız getSessionContext() / tanima üretir; testler muaf). */
export const tenantBaglami = (k: { klinik: string; kullanici: string }) => tenantBaglamiUret({ userId: k.kullanici, tenantId: k.klinik });
export const kullaniciBaglami = (kullaniciId: string) => kullaniciBaglamiUret(kullaniciId);
