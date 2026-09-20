import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { canAccessModule, resolveHubRedirect } from "@/lib/auth/roles";

/**
 * `lib/auth/roles.ts`'in DB'ye erişen yarısı — bilinçli olarak AYRI dosyada
 * (bkz. roles.ts'in başındaki yorum): bu dosya server-only (`next/headers`
 * üzerinden Supabase server client'ı), sadece Server Component'lerden/route
 * handler'lardan import edilmeli, hiçbir "use client" bileşenden değil.
 */

/**
 * Kullanıcının etkin modül listesi — TEK kaynak, hem Sidebar hem
 * `erisimKontrolEt` buradan besleniyor. `custom_permissions_enabled` açıksa
 * kullanıcıya özel liste, kapalıysa bağlı olduğu Pozisyon'un şablonu, hiçbiri
 * çözülemezse fail-closed boş liste.
 */
export const kullaniciModulleriGetir = cache(async (): Promise<string[]> => {
  const oturum = await gecerliKullanici();
  if (!oturum?.kullanici) return [];
  if (oturum.kullanici.rol === "super_admin") return ["*"];
  if (oturum.kullanici.custom_permissions_enabled) return oturum.kullanici.allowed_modules ?? [];

  const supabase = await createClient();
  const { data: personelKaydi } = await supabase
    .from("personel")
    .select("pozisyonlar(allowed_modules)")
    .eq("kullanici_id", oturum.kullanici.id)
    .maybeSingle<{ pozisyonlar: { allowed_modules: string[] } | null }>();

  return personelKaydi?.pozisyonlar?.allowed_modules ?? [];
});

/**
 * Hub sayfalarının (ör. /panel/finans/page.tsx) en başında çağrılır. Erişim
 * varsa hiçbir şey yapmaz; yoksa yetkili olunan ilk alt sayfaya, o da yoksa
 * /panel'e yönlendirir.
 */
export async function erisimKontrolEt(moduleKey: string): Promise<void> {
  const modulListesi = await kullaniciModulleriGetir();
  if (canAccessModule(modulListesi, moduleKey)) return;
  redirect(resolveHubRedirect(modulListesi, moduleKey) ?? "/panel");
}
