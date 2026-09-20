import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { erisimKontrolEt, kullaniciModulleriGetir } from "@/lib/auth/roles-server";

export default async function AyarlarSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  await erisimKontrolEt("ayarlar");
  const allowedModules = await kullaniciModulleriGetir();

  const grup = MENU_GRUPLARI.find((g) => g.key === "ayarlar")!;

  return <MenuGrubuSayfasi grup={grup} allowedModules={allowedModules} />;
}
