import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type KullaniciSatiri = {
  id: string;
  klinik_id: string | null;
  ad_soyad: string | null;
  rol: "super_admin" | "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe" | null;
  allowed_modules: string[];
  custom_permissions_enabled: boolean;
};

export type GecerliKullanici = {
  authUser: { id: string; email: string | null };
  kullanici: KullaniciSatiri | null;
};

/**
 * auth.getClaims() + kullanici SELECT'i tek yerde birleştirir. React cache()
 * ile sarılı: aynı istek/render içinde (örn. panel/layout.tsx + panel/page.tsx)
 * birden çok yerden çağrılsa da Supabase'e yalnız BİR KEZ gidilir.
 *
 * getUser() yerine getClaims(): proje asimetrik (ES256) imza anahtarına
 * geçmiş olduğundan getClaims() JWT'yi WebCrypto ile YERELDE doğruluyor,
 * Auth server'a hiç gitmiyor (getUser() her seferinde gidiyordu). JWKS
 * önbelleği @supabase/auth-js içinde MODÜL SEVİYESİNDE ve İSTEKLER ARASI
 * paylaşılıyor — React cache()'in aksine sıcak bir instance'da (Vercel
 * Fluid Compute) middleware ve Server Action'lar da dahil TÜM çağrılar
 * arasında geçerli, yeniden ağ isteği açmıyor.
 *
 * Kapsam notu: `kullanici` tablosu SELECT'i (rol/klinik_id) hâlâ ayrı bir
 * sorgu — bu veriler şu an JWT claim'i DEĞİL. Custom Access Token Hook ile
 * bunları claim'e gömüp bu sorguyu tamamen kaldırmak mümkün (Performans turu
 * 3, ADIM 3.3'te değerlendirildi) ama güvenlik etkisi ayrı incelenmeden
 * UYGULANMADI.
 */
export const gecerliKullanici = cache(async (): Promise<GecerliKullanici | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    return null;
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("id, klinik_id, ad_soyad, rol, allowed_modules, custom_permissions_enabled")
    .eq("id", claims.sub)
    .single<KullaniciSatiri>();

  return {
    authUser: { id: claims.sub, email: claims.email ?? null },
    kullanici: kullanici ?? null,
  };
});
