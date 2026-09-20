import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { erisimKontrolEt, kullaniciModulleriGetir } from "@/lib/auth/roles-server";

export default async function YonetimSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  await erisimKontrolEt("yonetim");
  const allowedModules = await kullaniciModulleriGetir();

  const grup = MENU_GRUPLARI.find((g) => g.key === "yonetim")!;

  return <MenuGrubuSayfasi grup={grup} allowedModules={allowedModules} />;
}
