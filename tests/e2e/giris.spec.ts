// Giriş duman testi (gerçek tarayıcı): Next server action + Better Auth çerez yazımı + proxy yönlendirmeleri.
// Giriş SONRASI sayfalar (/panel, /portal) modül taşıması bitene kadar eski Supabase'li kodu çalıştırır ve oturumu göremeyip /giris'e geri atar.
// Bu yüzden hedef, sunucu eyleminin YÖNLENDİRME BAŞLIĞINDAN (x-action-redirect) ve proxy'nin yönlendirme yanıtlarından (maxRedirects:0) okunur;
// sayfa içeriği doğrulanmaz. (Panel taşındıktan sonra bu testler nihai URL/içerik doğrulamasıyla sıkılaştırılır.)
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Hesap = { id: string; eposta?: string; telefon: string; sifre: string };
const hesaplar = JSON.parse(fs.readFileSync(path.join(__dirname, ".hesaplar.json"), "utf8")) as Record<string, Hesap>;
const h = (ad: string) => hesaplar[ad];
const TABAN = "http://localhost:3100";

/** Next dev'de form eylemi hidrasyondan önce tıklanırsa yerel gönderim sayfayı yeniler: ağ sakinleşene kadar bekle. */
async function git(page: Page, yol: string) {
  await page.goto(yol);
  await page.waitForLoadState("networkidle");
}

/** Formu gönderir ve sunucu eyleminin yönlendirme hedefini döndürür (yönlendirme yoksa null). */
async function gonderVeHedef(page: Page, dugme: string): Promise<string | null> {
  const yanit = page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(TABAN) && !r.url().includes("/_next/"));
  await page.getByRole("button", { name: dugme }).click();
  const r = await yanit;
  const baslik = r.headers()["x-action-redirect"];
  return baslik ? baslik.split(";")[0] : null;
}

async function personelGirisYap(page: Page, girisAdi: string, sifre: string, yol = "/giris") {
  await git(page, yol);
  await page.locator("#giris_adi").fill(girisAdi);
  await page.locator("#sifre").fill(sifre);
  return gonderVeHedef(page, "Giriş yap");
}

async function portalGirisYap(page: Page, yol: string, telefon: string, sifre: string, klinikKodu?: string) {
  await git(page, yol);
  if (klinikKodu) await page.locator("#klinik_kodu").fill(klinikKodu);
  await page.locator("#telefon").fill(telefon);
  await page.locator("#sifre").fill(sifre);
  return gonderVeHedef(page, "Giriş yap");
}

const oturumCerezi = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "klinik.session_token");
const temizSayfa = async (browser: Browser) => (await browser.newContext({ baseURL: TABAN })).newPage();
/** Proxy yönlendirmesini (yönlendirmeyi TAKİP ETMEDEN) okur: [durum, location yolu]. */
async function proxyYaniti(page: Page, yol: string): Promise<[number, string | null]> {
  const r = await page.request.get(yol, { maxRedirects: 0 });
  const loc = r.headers()["location"];
  return [r.status(), loc ? new URL(loc, TABAN).pathname : null];
}

test.describe("oturumsuz yönlendirme (proxy)", () => {
  test("/panel -> /giris, /portal -> /portal/giris, /sifre-degistir -> /giris", async ({ page }) => {
    expect(await proxyYaniti(page, "/panel")).toEqual([307, "/giris"]);
    expect(await proxyYaniti(page, "/panel/hastalar")).toEqual([307, "/giris"]);
    expect(await proxyYaniti(page, "/portal")).toEqual([307, "/portal/giris"]);
    expect(await proxyYaniti(page, "/sifre-degistir")).toEqual([307, "/giris"]);
    expect((await proxyYaniti(page, "/portal/klinikbir/giris"))[0]).toBe(200);
    expect((await proxyYaniti(page, "/giris"))[0]).toBe(200);
  });
});

test.describe("personel girişi", () => {
  test("e-posta ile giriş (klinik_admin): çerez httpOnly yazılır, eylem /panel'e yönlendirir", async ({ page }) => {
    const a = h("adminHazir");
    expect(await personelGirisYap(page, a.eposta!, a.sifre)).toBe("/panel");
    const c = await oturumCerezi(page);
    expect(c, "oturum çerezi yazılmadı").toBeTruthy();
    expect(c!.httpOnly).toBe(true);
    expect(c!.sameSite).toBe("Lax");
    expect(c!.path).toBe("/");
    const cihaz = (await page.context().cookies()).find((x) => x.name === "klinik_cihaz");
    expect(cihaz?.httpOnly).toBe(true);
    // (/panel'in nihai davranışı modül taşıması bitince doğrulanacak: eski sayfa Supabase oturumu bekleyip /giris'e geri yönlendirir)
  });

  test("telefon ile giriş (resepsiyon) /panel'e yönlenir; admin telefonla GİREMEZ", async ({ page, browser }) => {
    const r = h("resepsiyonHazir");
    expect(await personelGirisYap(page, r.telefon, r.sifre)).toBe("/panel");

    const a = h("adminHazir");
    const sayfa2 = await temizSayfa(browser);
    expect(await personelGirisYap(sayfa2, a.telefon, a.sifre)).toBeNull();
    await expect(sayfa2.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
    await expect(sayfa2).toHaveURL(/\/giris$/);
    expect(await oturumCerezi(sayfa2)).toBeUndefined();
  });

  test("hatalı parola: aynı sayfada genel hata, çerez yazılmaz (e-posta, telefon, bilinmeyen hesap)", async ({ page }) => {
    const a = h("adminHazir");
    expect(await personelGirisYap(page, a.eposta!, "YanlisSifre12345")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("E-posta veya şifre hatalı.");
    await expect(page).toHaveURL(/\/giris$/);
    expect(await oturumCerezi(page)).toBeUndefined();

    const r = h("resepsiyonHazir");
    expect(await personelGirisYap(page, r.telefon, "YanlisSifre12345")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
    expect(await personelGirisYap(page, "5000000000", "YanlisSifre12345")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
    expect(await oturumCerezi(page)).toBeUndefined();
  });

  test("?donus= yalnız güvenli puantaj adresine yönlendirir; dış adres yok sayılır", async ({ page, browser }) => {
    const a = h("adminDonus");
    expect(await personelGirisYap(page, a.eposta!, a.sifre, "/giris?donus=/puantaj/klinikbir/giris")).toBe("/puantaj/klinikbir/giris");

    const b = h("adminHazir");
    const sayfa2 = await temizSayfa(browser);
    expect(await personelGirisYap(sayfa2, b.eposta!, b.sifre, "/giris?donus=https://kotu.example/")).toBe("/panel");
    const sayfa3 = await temizSayfa(browser);
    expect(await personelGirisYap(sayfa3, b.eposta!, b.sifre, "/giris?donus=//kotu.example/panel")).toBe("/panel");
  });

  test("ilk giriş: geçici şifre -> /sifre-degistir zorunlu, başka sayfaya geçilemez, değiştirince /panel", async ({ page }) => {
    const a = h("adminGecici");
    expect(await personelGirisYap(page, a.eposta!, a.sifre)).toBe("/sifre-degistir");
    await expect(page).toHaveURL(/\/sifre-degistir$/);
    // proxy: bayrak açıkken korumalı hiçbir sayfa açılmaz
    expect(await proxyYaniti(page, "/panel")).toEqual([307, "/sifre-degistir"]);
    expect(await proxyYaniti(page, "/panel/hastalar")).toEqual([307, "/sifre-degistir"]);
    expect((await proxyYaniti(page, "/sifre-degistir"))[0]).toBe(200);
    await page.waitForLoadState("networkidle");

    // sunucu politikası: 10+ karakter (tarayıcı doğrulamasını geçer) ama rakamsız
    await page.locator("#mevcut_sifre").fill(a.sifre);
    await page.locator("#yeni_sifre").fill("sadeceHarfler");
    await page.locator("#yeni_sifre_tekrar").fill("sadeceHarfler");
    expect(await gonderVeHedef(page, "Şifreyi değiştir")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("en az bir harf ve bir rakam");
    await expect(page).toHaveURL(/\/sifre-degistir$/);

    await page.locator("#mevcut_sifre").fill(a.sifre);
    await page.locator("#yeni_sifre").fill("YeniSifre12345");
    await page.locator("#yeni_sifre_tekrar").fill("YeniSifre12345");
    expect(await gonderVeHedef(page, "Şifreyi değiştir")).toBe("/panel");
    expect(await oturumCerezi(page), "değiştirme sonrası yeni oturum çerezi yazılmalı").toBeTruthy();
    // artık zorunlu yönlendirme yok
    const [, loc] = await proxyYaniti(page, "/panel");
    expect(loc).not.toBe("/sifre-degistir");
  });

  test("çıkış: oturum çerezi silinir, /panel tekrar /giris'e yönlenir", async ({ page }) => {
    const a = h("adminCikis");
    expect(await personelGirisYap(page, a.eposta!, a.sifre)).toBe("/panel");
    expect(await oturumCerezi(page)).toBeTruthy();
    await page.goto("/api/oturum-cikis?hedef=/giris");
    const c = await oturumCerezi(page);
    expect(c === undefined || c.value === "").toBe(true);
    expect(await proxyYaniti(page, "/panel")).toEqual([307, "/giris"]);
  });
});

test.describe("hasta portalı", () => {
  test("kliniğe özel adres: doğru bilgilerle /portal; hasta panele giremez; geçici şifreyle /sifre-degistir", async ({ page, browser }) => {
    const x = h("hastaHazir");
    expect(await portalGirisYap(page, "/portal/klinikbir/giris", x.telefon, x.sifre)).toBe("/portal");
    expect(await oturumCerezi(page)).toBeTruthy();
    expect(await proxyYaniti(page, "/panel")).toEqual([307, "/portal"]);

    const g = h("hastaGecici");
    const sayfa2 = await temizSayfa(browser);
    expect(await portalGirisYap(sayfa2, "/portal/klinikbir/giris", g.telefon, g.sifre)).toBe("/sifre-degistir");
    expect(await proxyYaniti(sayfa2, "/portal")).toEqual([307, "/sifre-degistir"]);
  });

  test("yanlış klinik kodu ve hatalı parola genel hata verir; genel adreste klinik kodu istenir", async ({ page }) => {
    const x = h("hastaHazir");
    expect(await portalGirisYap(page, "/portal/klinikiki/giris", x.telefon, x.sifre)).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
    expect(await oturumCerezi(page)).toBeUndefined();

    expect(await portalGirisYap(page, "/portal/giris", x.telefon, "YanlisSifre12345", "klinikbir")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
    expect(await portalGirisYap(page, "/portal/giris", x.telefon, x.sifre, "yok-boyle-klinik")).toBeNull();
    await expect(page.locator('p[role="alert"]')).toContainText("Telefon veya şifre hatalı.");
  });
});
