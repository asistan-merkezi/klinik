// Durum değiştiren route handler'lar (POST) için CSRF savunması. Server action'larda Next.js Origin ↔ Host/X-Forwarded-Host karşılaştırmasını kendisi yapar
// (next.config.ts'te serverActions.allowedOrigins TANIMLI DEĞİL = yalnız aynı köken; test: lib/guvenlik/baslik.test.ts). Çerezler ayrıca SameSite=Lax.
// Route handler'larda bu yardımcı: tarayıcı `Origin` gönderdiyse beklenen kökenle AYNI olmalı; `Sec-Fetch-Site` same-origin/none dışındaysa reddedilir.
// İkisi de yoksa (sunucudan sunucuya/curl) çerezli bir tarayıcı isteği olamaz; oturum zaten çerezden gelir, bu yüzden izin verilir.

function beklenenKoken(istek: Request): string | null {
  const taban = process.env.BETTER_AUTH_URL;
  try {
    if (taban) return new URL(taban).origin;
  } catch {
    /* geçersiz taban: aşağıda başlıklardan türetilir */
  }
  const host = istek.headers.get("x-forwarded-host") ?? istek.headers.get("host");
  if (!host) return null;
  const proto = istek.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function ayniKokenMi(istek: Request): boolean {
  const fetchSite = istek.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = istek.headers.get("origin");
  if (!origin) return true;
  const beklenen = beklenenKoken(istek);
  return beklenen !== null && origin === beklenen;
}

export function caprazKokenYaniti(): Response {
  return Response.json({ error: "İstek reddedildi." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
