import { redirect } from "next/navigation";
import { Receipt, HandCoins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import type { MenuGrubu } from "@/lib/panel/menu-gruplari";
import { erisimKontrolEt, kullaniciModulleriGetir } from "@/lib/auth/roles-server";

const GRUP: MenuGrubu = {
  key: "gelirler-takibi",
  label: "Gelirler Takibi ve Faturalandırma",
  icon: HandCoins,
  ogeler: [
    { href: "/panel/finans/gelirler-takibi/faturalar", label: "Kesilen Faturalar", icon: Receipt },
    {
      href: "/panel/finans/gelirler-takibi/cari-alacaklar",
      label: "Cari Alacaklar Takibi",
      icon: HandCoins,
    },
  ],
};

export default async function GelirlerTakibiSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  await erisimKontrolEt("finans.gelirler_takibi");
  const allowedModules = await kullaniciModulleriGetir();

  return <MenuGrubuSayfasi grup={GRUP} allowedModules={allowedModules} />;
}
