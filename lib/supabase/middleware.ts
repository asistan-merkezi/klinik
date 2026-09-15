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

  // getClaims() JWT'yi yerelde (WebCrypto ile) doğrular — proje asimetrik
  // (ES256) imza anahtarına geçmiş olduğu için Auth server'a HİÇ gitmiyor
  // (getUser() her zaman gidiyordu). JWKS önbelleği modül seviyesinde ve
  // İSTEKLER ARASI paylaşılıyor (React cache()'den farklı, o yalnız tek
  // istek ömrü boyunca geçerli) — bu yüzden middleware gibi cache() kapsamı
  // dışındaki yerlerde de sıcak instance'da tekrar ağ isteği açmıyor.
  // Ölçüldü (Performans turu 3, ADIM 3): getUser() ~140ms ort., getClaims()
  // ~17ms ort. (aynı makine/ağ, art arda 150 istek A/B).
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

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
