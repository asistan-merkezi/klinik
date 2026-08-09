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
    .select("klinik_id, ad_soyad, rol")
    .eq("id", user.id)
    .single();

  const { data: klinik } = await supabase
    .from("klinik")
    .select("ad, logo_url, logo_url_koyu, marka_renkleri")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  return (
    <QueryProvider>
      <PanelSidebar
        klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
        kullaniciAdi={kullanici?.ad_soyad ?? user.email ?? ""}
        kullaniciRolu={kullanici?.rol ?? "rol atanmamış"}
      >
        {children}
      </PanelSidebar>
    </QueryProvider>
  );
}
