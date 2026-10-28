import { redirect } from "next/navigation";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";

export default async function MuhasebeSayfasi() {
  const ctx = await oturumBaglami();

  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }

  const grup = MENU_GRUPLARI.find((g) => g.key === "finans")!;

  return <MenuGrubuSayfasi grup={grup} />;
}
