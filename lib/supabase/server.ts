import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// React cache() ile sarılı: aynı render/istek içinde createClient() birden
// çok yerden çağrılsa da tek Supabase client örneği paylaşılır. Bu, ARDINDAN
// gelen .auth.getUser()/.from(...) çağrılarını TEK BAŞINA deduplike etmez —
// onun için bkz. lib/auth/gecerli-kullanici.ts. cache() yalnız aynı React
// render ağacı içinde çalışır; middleware ve Server Action çağrıları ayrı
// istek ömrüne sahip olduğundan kapsam DIŞINDA kalır.
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component içinden çağrıldığında set edilemez;
            // middleware oturumu zaten yeniliyor, güvenle yok sayılabilir.
          }
        },
      },
    }
  );
});
