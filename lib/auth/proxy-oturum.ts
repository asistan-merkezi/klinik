// proxy.ts oturum kapısı (Next.js 16 proxy, Node.js runtime): oturumu Better Auth'tan (veritabanı) okur, saf karar fonksiyonuna verir.
// Eski lib/supabase/middleware.ts'in yerini alır; matcher ve /panel, /portal yönlendirme davranışı korunmuştur.
import { NextResponse, type NextRequest } from "next/server";
import { oturumOku } from "./oturum";
import { proxyKarari, type ProxyOturumu } from "./proxy-karari";

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
  if (karar.tur === "gec") return NextResponse.next({ request });
  const url = request.nextUrl.clone();
  url.pathname = karar.hedef;
  url.search = "";
  return NextResponse.redirect(url);
}
