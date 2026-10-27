// Canlı olay (SSE) duman testi: gerçek Next sunucusu + gerçek Better Auth oturumu + gerçek Postgres NOTIFY.
// Sayfa içi EventSource kullanılır (tarayıcının gerçek çerez/akış davranışı); veri çekimi tüketicilerde modül taşımasıyla gelir.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { expect, test, type Page } from "@playwright/test";

const dosya = JSON.parse(fs.readFileSync(path.join(__dirname, ".hesaplar.json"), "utf8"));
const ortam = dosya._ortam as { port: number; k1: Record<string, string>; k2: Record<string, string> };
const TABAN = "http://localhost:3100";
let sayac = 0;

async function git(page: Page, yol: string) {
  await page.goto(yol);
  await page.waitForLoadState("networkidle");
}

async function girisYap(page: Page, eposta: string, sifre: string) {
  await git(page, "/giris");
  await page.locator("#giris_adi").fill(eposta);
  await page.locator("#sifre").fill(sifre);
  const yanit = page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(TABAN) && !r.url().includes("/_next/"));
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await yanit;
}

async function randevuEkle(k: Record<string, string>): Promise<string> {
  const id = crypto.randomUUID();
  const c = new pg.Client({ host: "localhost", port: ortam.port, user: "postgres", password: "yerel-deneme", database: "klinik" });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("select set_config('app.tenant_id', $1, true)", [k.klinik]);
    const n = 5000 + ++sayac * 3 + Math.floor(Math.random() * 1000);
    await c.query(
      `insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' hours')::interval, now() + ($6 || ' hours 20 minutes')::interval)`,
      [id, k.klinik, k.hasta, k.terapist, k.oda, String(n)]
    );
    await c.query("COMMIT");
  } finally {
    await c.end();
  }
  return id;
}

test.describe("canlı olay akışı (SSE)", () => {
  test("oturumsuz 401; geçersiz tablo listesi 400", async ({ page, browser }) => {
    const temiz = await (await browser.newContext({ baseURL: TABAN })).newPage();
    expect((await temiz.request.get("/api/canli?t=randevu")).status()).toBe(401);
    const e = dosya.adminHazir;
    await girisYap(page, e.eposta, e.sifre);
    expect((await page.request.get("/api/canli?t=hasta")).status()).toBe(400);
    expect((await page.request.get("/api/canli")).status()).toBe(400);
  });

  test("oturumlu personel kendi kliniğinin olayını alır, başka kliniğinkini almaz; yük yalnız {t,i}", async ({ page }) => {
    const e = dosya.adminHazir;
    await girisYap(page, e.eposta, e.sifre);
    await git(page, "/tablet-offline.html"); // statik sayfa: aynı origin + oturum çerezi, uygulama kodu karışmaz
    await page.evaluate(() => {
      const w = window as unknown as { __olaylar: string[]; __hazir: boolean };
      w.__olaylar = [];
      w.__hazir = false;
      const es = new EventSource("/api/canli?t=randevu");
      es.addEventListener("hazir", () => (w.__hazir = true));
      es.addEventListener("olay", (m) => w.__olaylar.push((m as MessageEvent<string>).data));
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __hazir: boolean }).__hazir)).toBe(true);

    const baskaKlinik = await randevuEkle(ortam.k2);
    const kendi = await randevuEkle(ortam.k1);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __olaylar: string[] }).__olaylar.join("|")), { timeout: 15_000 })
      .toContain(kendi);
    await page.waitForTimeout(1000);
    const olaylar = await page.evaluate(() => (window as unknown as { __olaylar: string[] }).__olaylar);
    expect(olaylar.join("|")).not.toContain(baskaKlinik);
    for (const o of olaylar) expect(Object.keys(JSON.parse(o)).sort()).toEqual(["i", "t"]);
  });

  test("hasta oturumu panel olaylarını alamaz (403)", async ({ browser }) => {
    const h = dosya.hastaHazir;
    const page = await (await browser.newContext({ baseURL: TABAN })).newPage();
    await git(page, "/portal/klinikbir/giris");
    await page.locator("#telefon").fill(h.telefon);
    await page.locator("#sifre").fill(h.sifre);
    const yanit = page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(TABAN) && !r.url().includes("/_next/"));
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await yanit;
    expect((await page.request.get("/api/canli?t=randevu")).status()).toBe(403);
  });
});
