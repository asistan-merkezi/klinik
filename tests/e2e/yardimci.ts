import type { Page } from "@playwright/test";

/**
 * Next dev'de form eylemi hidrasyondan ÖNCE tıklanırsa yerel gönderim sayfayı yeniler (eylem hiç çalışmaz). "networkidle" hidrasyonu GARANTİ etmez
 * (yük altında derleme gecikir): bunun yerine React'in forma bağladığı olay işleyicisi (`__reactProps$…`) beklenir — hidrasyonun doğrudan sinyali.
 */
export async function hidrasyonBekle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const f = document.querySelector("form");
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"));
    },
    undefined,
    { timeout: 60_000 }
  );
}
