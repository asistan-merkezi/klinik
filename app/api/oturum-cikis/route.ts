import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OTURUM_ANAHTARI_COOKIE } from "@/lib/auth/oturum-kilidi";

// Tek oturum kilidi başka bir yerden yeniden giriş tespit ettiğinde
// (bkz. lib/auth/oturum-kilidi.ts) buraya yönlendirilir — Server Component
// içinden cookie temizlenemediği için gerçek signOut() burada, bir Route
// Handler'da yapılıyor. `hedef` yalnız bilinen giriş ekranlarından biri
// olabilir (open redirect'e kapalı).
const IZINLI_HEDEFLER = new Set(["/giris", "/portal/giris"]);

export async function GET(request: NextRequest) {
  const istenenHedef = request.nextUrl.searchParams.get("hedef");
  const hedef = IZINLI_HEDEFLER.has(istenenHedef ?? "") ? istenenHedef! : "/giris";

  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = hedef;
  url.search = "?hata=baska_cihaz";

  const response = NextResponse.redirect(url);
  response.cookies.delete(OTURUM_ANAHTARI_COOKIE);
  return response;
}
