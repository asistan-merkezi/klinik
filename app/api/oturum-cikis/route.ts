import { NextResponse, type NextRequest } from "next/server";
import { cikisYap } from "@/lib/auth";

// Oturumu kapatıp giriş ekranına yönlendirir (GET: eski bağlantılar için). `hedef` yalnız bilinen giriş ekranlarından biri olabilir (open redirect'e kapalı).
const IZINLI_HEDEFLER = new Set(["/giris", "/portal/giris"]);

export async function GET(request: NextRequest) {
  const istenenHedef = request.nextUrl.searchParams.get("hedef");
  const hedef = IZINLI_HEDEFLER.has(istenenHedef ?? "") ? istenenHedef! : "/giris";
  const cerezler = await cikisYap(request.headers);
  const url = request.nextUrl.clone();
  url.pathname = hedef;
  url.search = "";
  const response = NextResponse.redirect(url);
  for (const c of cerezler) response.headers.append("set-cookie", c);
  return response;
}
