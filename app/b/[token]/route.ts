import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { baglantiyiCoz } from "@/lib/mesaj/baglanti-coz";

// Mesajlardaki tek kullanımlık, süreli bağlantı. Oturum AÇMAZ; yalnız giriş sayfasına yönlendirir. Ayrıntı: lib/mesaj/baglanti-coz.ts.
export async function GET(istek: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sonuc = await baglantiyiCoz(token, await headers());
  if (sonuc.tur === "hiz") return new Response("Çok fazla istek. Lütfen daha sonra tekrar deneyin.", { status: 429, headers: { "Cache-Control": "no-store" } });
  if (sonuc.tur === "kullanilamiyor") return new Response("İşlem şu anda yapılamıyor.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const taban = process.env.BETTER_AUTH_URL ?? new URL(istek.url).origin;
  const yanit = NextResponse.redirect(new URL(sonuc.yol, taban), 303);
  yanit.headers.set("Cache-Control", "no-store");
  yanit.headers.set("Referrer-Policy", "no-referrer"); // token yönlendirilen sayfaya referrer ile sızmasın
  return yanit;
}
