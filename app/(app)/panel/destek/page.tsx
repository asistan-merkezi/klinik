import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { kullaniciModulleriGetir } from "@/lib/auth/roles-server";

export default async function DestekSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  // "destek" her zaman erişilebilir (canAccessModule özel durumu) — erisimKontrolEt
  // gerekmiyor, allowedModules yalnız MenuGrubuSayfasi'nin ortak prop şeması için.
  const allowedModules = await kullaniciModulleriGetir();

  const grup = MENU_GRUPLARI.find((g) => g.key === "destek")!;

  return <MenuGrubuSayfasi grup={grup} allowedModules={allowedModules} />;
}
