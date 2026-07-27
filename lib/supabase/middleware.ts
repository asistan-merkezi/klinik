import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPanelRotasi = request.nextUrl.pathname.startsWith("/panel");
  const isPortalRotasi =
    request.nextUrl.pathname.startsWith("/portal") &&
    request.nextUrl.pathname !== "/portal/giris";

  if (!user && isPanelRotasi) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    return NextResponse.redirect(url);
  }

  if (!user && isPortalRotasi) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/giris";
    return NextResponse.redirect(url);
  }

  return response;
}
