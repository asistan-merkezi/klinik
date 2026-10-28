// PDF üretimi: SİSTEM Chrome/Edge (CHROMIUM_PATH) + puppeteer-core. @sparticuz/chromium kaldırıldı (Vercel/serverless artığıydı).
// Güvenlik katmanları (tümü birlikte):
//   1) Ağ: Chromium bir proxy'ye (kapalı 127.0.0.1:9) yönlendirilir ve tüm DNS çözümlemesi başarısız olur → dışarıya HİÇBİR bağlantı kurulamaz.
//   2) İstek yakalama: sayfa yalnız `data:` ve `about:blank` isteklerine izin verir; http(s), file://, ftp, blob, chrome:// ... iptal edilir ve kaydedilir.
//   3) JavaScript sayfada KAPALI (şablonlar betik gerektirmez); HTML şablonlarındaki CSP meta etiketi de aynısını söyler.
//   4) Eşzamanlılık: aynı anda en çok PDF_ESZAMANLILIK (2) işlem, kuyruk sınırlı; tek işlem zaman aşımı (PDF_ZAMAN_ASIMI_MS) → tarayıcı SÖNDÜRÜLÜR.
//   5) Bellek: V8 yığın sınırı (--js-flags) + tek renderer süreci; zaman aşımında süreç öldürülür; geçici profil klasörü her işlemde silinir.
import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";
import { Semafor } from "./semafor";

export const PDF_ESZAMANLILIK = 2;
export const PDF_KUYRUK_MAKS = 8;
export const PDF_BEKLEME_MS = 20_000;
export const PDF_ZAMAN_ASIMI_MS = 30_000;
const PDF_BELLEK_MB = 384;

export class PdfZamanAsimi extends Error {
  constructor() {
    super("PDF üretimi zaman aşımına uğradı.");
    this.name = "PdfZamanAsimi";
  }
}

const semafor = new Semafor(PDF_ESZAMANLILIK, PDF_KUYRUK_MAKS, PDF_BEKLEME_MS);
export const pdfDurumu = () => semafor.durum;

/** İzin verilen istek adresleri: yalnız gömülü içerik. Test edilebilir saf fonksiyon. */
export function istekIzinliMi(url: string): boolean {
  return url === "about:blank" || /^data:/i.test(url);
}

/** Testler için: sistemde kullanılabilir Chrome/Edge var mı? */
export function chromiumVarMi(): boolean {
  try {
    chromiumYolu();
    return true;
  } catch {
    return false;
  }
}

function chromiumYolu(): string {
  const yol = process.env.CHROMIUM_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? yerelChromeYoluBul();
  if (!yol) throw new Error("Chrome/Edge bulunamadı: CHROMIUM_PATH ortam değişkenini sistem Chrome/Edge yürütülebilir dosyasına ayarlayın.");
  return yol;
}

export const SERTLESTIRILMIS_ARGUMANLAR = [
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-default-apps",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
  "--disable-gpu",
  "--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication",
  "--proxy-server=http://127.0.0.1:9", // kapalı port: ağ bağlantısı denemesi başarısız olur
  "--host-resolver-rules=MAP * ~NOTFOUND", // hiçbir ad çözülmez
  "--renderer-process-limit=1",
  `--js-flags=--max-old-space-size=${PDF_BELLEK_MB}`,
];

async function tarayiciBaslat(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  return puppeteer.launch({ executablePath: chromiumYolu(), headless: true, args: SERTLESTIRILMIS_ARGUMANLAR, timeout: 15_000 });
}

export type PdfSonucu = { pdf: Buffer; engellenenIstekler: string[] };

/**
 * HTML -> PDF. Semafor + zaman aşımı + sertleştirilmiş tarayıcı. Hata: PdfKuyrukDolu (503), PdfZamanAsimi (504) ya da başlatma/üretim hatası.
 * `engellenenIstekler`: sayfanın yapmaya çalıştığı ama engellenen dış istekler (şablonda olmaması gerekir; teşhis ve test için).
 */
export function pdfUret(html: string, secenek: { zamanAsimiMs?: number } = {}): Promise<PdfSonucu> {
  const sinir = secenek.zamanAsimiMs ?? PDF_ZAMAN_ASIMI_MS;
  return semafor.calistir(async () => {
    const browser = await tarayiciBaslat();
    let bitti = false;
    const zaman = new Promise<never>((_, reddet) => {
      setTimeout(() => {
        if (bitti) return;
        browser.process()?.kill("SIGKILL"); // takılan Chromium'u kesin sonlandır
        reddet(new PdfZamanAsimi());
      }, sinir).unref();
    });
    try {
      return await Promise.race([isle(browser, html, sinir), zaman]);
    } finally {
      bitti = true;
      await browser.close().catch(() => browser.process()?.kill("SIGKILL"));
    }
  });
}

async function isle(browser: Browser, html: string, sinir: number): Promise<PdfSonucu> {
  const page = await browser.newPage();
  page.setDefaultTimeout(sinir);
  await page.setJavaScriptEnabled(false);
  const engellenenIstekler: string[] = [];
  await page.setRequestInterception(true);
  page.on("request", (istek) => {
    const url = istek.url();
    if (istekIzinliMi(url)) void istek.continue();
    else {
      engellenenIstekler.push(url.slice(0, 200));
      void istek.abort("blockedbyclient");
    }
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.emulateMediaType("print");
  const pdf = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: false, margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" } });
  return { pdf: Buffer.from(pdf), engellenenIstekler };
}

function yerelChromeYoluBul(): string | null {
  const adaylar =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];
  return adaylar.find((yol) => existsSync(yol)) ?? null;
}
