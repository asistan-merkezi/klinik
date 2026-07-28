import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PanelSidebar } from "@/components/panel/sidebar";
import { QueryProvider } from "@/components/panel/query-provider";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("ad_soyad, rol")
    .eq("id", user.id)
    .single();

  return (
    <QueryProvider>
      <PanelSidebar
        kullaniciAdi={kullanici?.ad_soyad ?? user.email ?? ""}
        kullaniciRolu={kullanici?.rol ?? "rol atanmamış"}
      >
        {children}
      </PanelSidebar>
    </QueryProvider>
  );
}
