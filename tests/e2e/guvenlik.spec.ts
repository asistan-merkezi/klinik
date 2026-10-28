// Tarayıcıda güvenlik başlıkları ve CSP: nonce'lu betikler çalışır (sayfa hidrate olur), CSP ihlali OLMAZ, başlıklar her belgede var.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hidrasyonBekle } from "./yardimci";

const hesaplar = JSON.parse(fs.readFileSync(path.join(__dirname, ".hesaplar.json"), "utf8")) as Record<string, { eposta?: string; telefon: string; sifre: string }>;

const SAYFALAR = ["/giris", "/portal/giris", "/sifremi-unuttum", "/"];

for (const yol of SAYFALAR) {
  test(`${yol}: CSP nonce'lu, ortak başlıklar var, tarayıcıda CSP ihlali yok`, async ({ page }) => {
    const ihlaller: string[] = [];
    page.on("console", (m) => {
      if (/content security policy|refused to (execute|load|apply)/i.test(m.text())) ihlaller.push(m.text());
    });
    page.on("pageerror", (e) => ihlaller.push(`pageerror: ${e.message}`));
    const yanit = await page.goto(yol, { waitUntil: "networkidle" });
    const b = yanit!.headers();
    const csp = b["content-security-policy"];
    expect(csp, "CSP başlığı").toBeTruthy();
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp.match(/script-src[^;]*/)![0]).not.toContain("'unsafe-inline'");
    expect(b["x-content-type-options"]).toBe("nosniff");
    expect(b["x-frame-options"]).toBe("DENY");
    expect(b["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(b["permissions-policy"]).toContain("camera=(self)");
    expect(b["x-powered-by"]).toBeUndefined();
    // Her istekte FARKLI nonce; sayfadaki betiklerin hepsi o nonce'u taşır
    const ikinci = await page.request.get(yol);
    expect(/'nonce-([^']+)'/.exec(ikinci.headers()["content-security-policy"])![1]).not.toBe(nonce);
    const betikler = await page.$$eval("script", (l) => l.map((s) => ({ nonce: s.nonce || s.getAttribute("nonce") || "", src: s.src })));
    expect(betikler.length).toBeGreaterThan(0);
    // Çerçeve betikleri bu isteğin nonce'unu taşır (geliştirme sunucusunun dinamik HMR betiği hariç: strict-dynamic ile güvenilen betik ekler).
    const nonceli = betikler.filter((s) => s.nonce === nonce);
    expect(nonceli.length, "nonce'lu çerçeve betikleri").toBeGreaterThan(0);
    // Asıl kanıt: tarayıcı hiçbir betiği CSP nedeniyle ENGELLEMEDİ (aşağıda) ve sayfa hidrate oldu.
    expect(ihlaller).toEqual([]);
  });
}

test("API yanıtlarında da temel başlıklar var, X-Powered-By yok", async ({ page }) => {
  const r = await page.request.get("/api/saglik");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
  expect(r.headers()["x-powered-by"]).toBeUndefined();
});

test("kimlik doğrulama uçları çapraz kökenli istekle çerez/oturum üretmez (Better Auth köken denetimi)", async ({ request }) => {
  const r = await request.post("/api/auth/sign-in/email", { data: { email: "a@b.com", password: "x" }, headers: { origin: "https://evil.example", "content-type": "application/json" } });
  expect([400, 401, 403, 404]).toContain(r.status());
  expect(r.headers()["set-cookie"]).toBeUndefined();
});

/** Giriş yapar; giriş sonrası panel sayfalarında tarayıcının CSP nedeniyle engellediği betik/kaynak OLMAMALI (hidrasyon, tema betiği, canlı akış). */
async function girisVeSayfaDenetle(page: Page, girisAdi: string, sifre: string, yollar: string[]) {
  const ihlaller: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to (execute|load|apply|connect)/i.test(m.text())) ihlaller.push(m.text());
  });
  await page.goto("/giris");
  await page.waitForLoadState("networkidle");
  await hidrasyonBekle(page);
  await page.locator("#giris_adi").fill(girisAdi);
  await page.locator("#sifre").fill(sifre);
  await Promise.all([page.waitForURL(/\/panel/, { timeout: 60_000 }), page.getByRole("button", { name: "Giriş yap" }).click()]);
  for (const yol of yollar) {
    const r = await page.goto(yol, { waitUntil: "networkidle" });
    expect(r!.status(), yol).toBeLessThan(500);
    expect(r!.headers()["content-security-policy"], yol).toContain("'nonce-");
  }
  expect(ihlaller).toEqual([]);
}

test("giriş sonrası panel (yönetici): CSP ihlali yok", async ({ page }) => {
  await girisVeSayfaDenetle(page, hesaplar.adminHazir.eposta!, hesaplar.adminHazir.sifre, ["/panel", "/panel/randevular", "/panel/hastalar"]);
});

test("giriş sonrası panel (terapist): çizelge ve hasta listesi 4c sonrası da açılır, CSP ihlali yok", async ({ page }) => {
  await girisVeSayfaDenetle(page, hesaplar.terapistHazir.telefon, hesaplar.terapistHazir.sifre, ["/panel", "/panel/randevular", "/panel/hastalar"]);
  // Terapistin kapalı sekmeleri hâlâ kapalı (cari/finans sayfası terapiste yönlenir)
  await page.goto("/panel/finans/kasa", { waitUntil: "networkidle" });
  expect(new URL(page.url()).pathname).not.toBe("/panel/finans/kasa");
});

test("CSRF: gerçek bir sunucu eylemi isteği başka bir Origin ile TEKRARLANIRSA reddedilir (Next Origin↔Host denetimi); aynı kökenli tekrar işlenir", async ({ page, request }) => {
  let yakalanan: { url: string; basliklar: Record<string, string>; govde: Buffer } | null = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"] && !yakalanan) yakalanan = { url: r.url(), basliklar: r.headers(), govde: r.postDataBuffer() ?? Buffer.alloc(0) };
  });
  await page.goto("/giris");
  await page.waitForLoadState("networkidle");
  await hidrasyonBekle(page);
  await page.locator("#giris_adi").fill("csrf-denemesi@deneme.test");
  await page.locator("#sifre").fill("yanlis-parola-123");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect.poll(() => yakalanan !== null).toBe(true);
  const g = yakalanan!;
  const ortak = { "next-action": g.basliklar["next-action"], "content-type": g.basliklar["content-type"], "next-router-state-tree": g.basliklar["next-router-state-tree"] ?? "" };
  const kotu = await request.post(g.url, { data: g.govde, headers: { ...ortak, origin: "https://evil.example" } });
  expect(kotu.status(), "farklı Origin").not.toBe(200);
  expect(await kotu.text()).not.toContain("Giriş bilgileri");
  const kotu2 = await request.post(g.url, { data: g.govde, headers: { ...ortak, origin: "http://localhost:9999" } });
  expect(kotu2.status(), "farklı port").not.toBe(200);
  // Kontrol: aynı kökenli tekrar Next tarafından kabul edilir (200; eylem çalışır ve genel hata döner)
  const iyi = await request.post(g.url, { data: g.govde, headers: { ...ortak, origin: "http://localhost:3100" } });
  expect(iyi.status(), "aynı Origin").toBe(200);
});
