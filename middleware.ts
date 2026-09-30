import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // tablet-sw.js / tablet-offline.html: oturumsuz, statik — auth yönlendirmesine
  // takılırlarsa service worker kaydı ve çevrimdışı yedek sayfa bozulur.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|tablet-sw\\.js|tablet-offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
