import { panelBaglami } from "@/lib/auth/yetki";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";

export default async function DestekSayfasi() {
  await panelBaglami();
  const grup = MENU_GRUPLARI.find((g) => g.key === "destek")!;
  return <MenuGrubuSayfasi grup={grup} />;
}
