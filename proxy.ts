import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: eski `middleware.ts` dosya kuralı "proxy" olarak yeniden adlandırıldı
// (Node.js runtime'da çalışır). Oturum yenileme + /panel, /portal yönlendirmesi.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // tablet-sw.js / tablet-offline.html: oturumsuz, statik — auth yönlendirmesine
  // takılırlarsa service worker kaydı ve çevrimdışı yedek sayfa bozulur.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|tablet-sw\\.js|tablet-offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
