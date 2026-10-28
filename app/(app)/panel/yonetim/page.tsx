import { redirect } from "next/navigation";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";

export default async function YonetimSayfasi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") redirect("/giris");
  // super_admin klinik menüsünü yalnız destek bağlamında görür; bağlam yoksa bağlam açma sayfasına.
  if (!ctx.tenantId && ctx.rol === "super_admin") redirect("/panel/yonetim/destek-baglami");
  const grup = MENU_GRUPLARI.find((g) => g.key === "yonetim")!;
  return <MenuGrubuSayfasi grup={grup} />;
}
