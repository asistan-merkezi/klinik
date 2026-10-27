import { type NextRequest } from "next/server";
import { oturumKapisi } from "@/lib/auth/proxy-oturum";

// Next.js 16: eski `middleware.ts` dosya kuralı "proxy" olarak yeniden adlandırıldı (Node.js runtime'da çalışır).
// Oturum doğrulama (Better Auth, veritabanı) + /panel, /portal, /sifre-degistir yönlendirmesi. Cookie varlığı yetmez: oturum DB'den okunur.
export async function proxy(request: NextRequest) {
  return oturumKapisi(request);
}

export const config = {
  // tablet-sw.js / tablet-offline.html: oturumsuz, statik — auth yönlendirmesine
  // takılırlarsa service worker kaydı ve çevrimdışı yedek sayfa bozulur.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|tablet-sw\.js|tablet-offline\.html|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
