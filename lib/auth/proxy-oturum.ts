// proxy.ts oturum kapısı (Next.js 16 proxy, Node.js runtime): oturumu Better Auth'tan (veritabanı) okur, saf karar fonksiyonuna verir.
import { NextResponse, type NextRequest } from "next/server";
import { oturumOku } from "./oturum";
import { proxyKarari, type ProxyOturumu } from "./proxy-karari";
import { cspMetni, nonceUret } from "@/lib/guvenlik/csp";

// CSP yalnız HTML belgesi döndüren yollarda (API ve /b/ yönlendirmesi hariç): nonce istek başlığıyla sayfaya taşınır (Next.js nonce'u CSP başlığından okur).
const belgeYoluMu = (yol: string) => !yol.startsWith("/api/") && !yol.startsWith("/b/");

export async function oturumKapisi(request: NextRequest): Promise<NextResponse> {
  const yol = request.nextUrl.pathname;
  let oturum: ProxyOturumu = null;
  try {
    const o = await oturumOku(request.headers);
    if (o) oturum = { tur: o.user.tur === "hasta" ? "hasta" : "personel", sifreDegistirmeli: Boolean(o.user.sifreDegistirmeli) };
  } catch (e) {
    // Oturum doğrulanamıyorsa (ör. veritabanı erişilemez) korumalı sayfalara İZİN VERİLMEZ: oturumsuz say (fail-closed).
    console.error("[proxy] oturum okunamadı:", e instanceof Error ? e.message : e);
  }
  const karar = proxyKarari(yol, oturum);
  if (karar.tur === "gec") {
    if (!belgeYoluMu(yol)) return NextResponse.next({ request });
    const nonce = nonceUret();
    const csp = cspMetni(nonce, process.env.NODE_ENV === "production");
    const istekBasliklari = new Headers(request.headers);
    istekBasliklari.set("Content-Security-Policy", csp);
    istekBasliklari.set("x-nonce", nonce); // next-themes'in satır içi betiği için (app/(app)/layout.tsx)
    const yanit = NextResponse.next({ request: { headers: istekBasliklari } });
    yanit.headers.set("Content-Security-Policy", csp);
    return yanit;
  }
  const url = request.nextUrl.clone();
  url.pathname = karar.hedef;
  url.search = "";
  return NextResponse.redirect(url);
}
