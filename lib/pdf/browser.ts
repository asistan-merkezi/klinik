import { existsSync } from "fs";
import type { Browser } from "puppeteer-core";

/**
 * Vercel (serverless/Lambda benzeri) ortamda @sparticuz/chromium'un
 * kendi taşıdığı Chromium binary'si kullanılır; yerelde (bu makinede
 * kayıtlı bir Chrome/Edge yoksa) PUPPETEER_EXECUTABLE_PATH ortam
 * değişkeniyle bir Chromium yürütülebilir dosyası verilmesi gerekir.
 * Tek kod yolu — sadece executablePath kaynağı farklı.
 */
export async function pdfIcinTarayiciBaslat(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const sunucusuz = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (sunucusuz) {
    const chromium = (await import("@sparticuz/chromium")).default;
    // chromium.args zaten "--headless='shell'" flag'ini içeriyor (v149'da
    // ayrı bir chromium.headless getter'ı kalmadı) — headless_shell binary'si
    // sadece bu eski-stil headless modu destekliyor, `headless:true` (yeni
    // headless mod) verilirse çakışan/yanlış bir flag daha eklenip başlatma
    // başarısız olabiliyor, o yüzden burada da aynı "shell" değeri veriliyor.
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? yerelChromeYoluBul();
  if (!executablePath) {
    throw new Error(
      "Yerel Chrome/Chromium bulunamadı. PUPPETEER_EXECUTABLE_PATH ortam değişkenini bir Chrome/Chromium yürütülebilir dosyasına ayarlayın."
    );
  }

  return puppeteer.launch({ executablePath, headless: true });
}

function yerelChromeYoluBul(): string | null {
  const adaylar =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];

  return adaylar.find((yol) => existsSync(yol)) ?? null;
}
