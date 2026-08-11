import { redirect } from "next/navigation";
import { BookOpen, Bot, LifeBuoy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MenuGrubuSayfasi } from "@/components/panel/menu-grubu-sayfasi";
import type { MenuGrubu } from "@/lib/panel/menu-gruplari";

const GRUP: MenuGrubu = {
  key: "destek",
  label: "Destek",
  icon: LifeBuoy,
  ogeler: [
    { href: "/panel/ayarlar/destek/kullanim-kilavuzu", label: "Kullanım Kılavuzu", icon: BookOpen },
    { href: "/panel/ayarlar/destek/chatbot", label: "Destek Chatbotu", icon: Bot },
  ],
};

export default async function DestekSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  return <MenuGrubuSayfasi grup={GRUP} />;
}
