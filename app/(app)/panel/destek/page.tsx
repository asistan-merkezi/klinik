import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";

export default async function DestekSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const grup = MENU_GRUPLARI.find((g) => g.key === "destek")!;

  return <MenuGrubuSayfasi grup={grup} />;
}
