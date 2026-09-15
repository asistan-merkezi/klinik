import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { PanelSidebar } from "@/components/panel/sidebar";
import { QueryProvider } from "@/components/panel/query-provider";
import { bildirimSayisiGetir } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-sayisi";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }
  const { authUser: user, kullanici } = oturum;

  const supabase = await createClient();

  // Bildirim zili — Hastalar listesi ve Ana Ekran'daki BildirimButonu ile
  // aynı görünürlük kuralı (bkz. bildirim-sayisi.ts): sadece klinik_admin ve
  // resepsiyon görür. klinik ve bildirim sayısı birbirinden bağımsız —
  // Promise.all ile paralel (önceden sıralıydı).
  const bildirimGorulebilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon";
  const [{ data: klinik }, bildirimSayisi] = await Promise.all([
    supabase
      .from("klinik")
      .select("ad, logo_url, logo_url_koyu, marka_renkleri, plan_turu")
      .eq("id", kullanici?.klinik_id ?? "")
      .maybeSingle(),
    bildirimGorulebilir ? bildirimSayisiGetir(supabase) : Promise.resolve(undefined),
  ]);

  return (
    <QueryProvider>
      <PanelSidebar
        klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
        klinikPlani={klinik?.plan_turu ?? null}
        kullaniciAdi={kullanici?.ad_soyad ?? user.email ?? ""}
        kullaniciRolu={kullanici?.rol ?? "rol atanmamış"}
        bildirimSayisi={bildirimSayisi}
      >
        {children}
      </PanelSidebar>
    </QueryProvider>
  );
}
