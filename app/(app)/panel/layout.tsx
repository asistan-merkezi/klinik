import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { PanelSidebar } from "@/components/panel/sidebar";
import { QueryProvider } from "@/components/panel/query-provider";
import { bildirimSayisiGetir } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-sayisi";
import { SIDEBAR_GIZLI_VARSAYILAN } from "@/lib/panel/menu-gruplari";

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
  const [{ data: klinik }, bildirimSayisi, { data: klinikAyarlar }] = await Promise.all([
    supabase
      .from("klinik")
      .select("ad, logo_url, logo_url_koyu, marka_renkleri, plan_turu")
      .eq("id", kullanici?.klinik_id ?? "")
      .maybeSingle(),
    bildirimGorulebilir ? bildirimSayisiGetir(supabase) : Promise.resolve(undefined),
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", kullanici?.klinik_id ?? "").maybeSingle(),
  ]);

  // Ayarlar > Yetkilendirme'deki Sidebar Menü Görünürlüğü — klinik hiç
  // özelleştirmediyse SIDEBAR_GIZLI_VARSAYILAN'a düşer (eski sabit kodlu
  // "terapist Finans'ı görmez" kuralıyla aynı).
  const sidebarGizli = (klinikAyarlar?.ayarlar as Record<string, unknown> | null)?.sidebar_gizli as
    | Record<string, string[]>
    | undefined;
  const gizliMenuAnahtarlari =
    sidebarGizli?.[kullanici?.rol ?? ""] ?? SIDEBAR_GIZLI_VARSAYILAN[kullanici?.rol ?? ""] ?? [];

  return (
    <QueryProvider>
      <PanelSidebar
        klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
        klinikPlani={klinik?.plan_turu ?? null}
        kullaniciAdi={kullanici?.ad_soyad ?? user.email ?? ""}
        kullaniciRolu={kullanici?.rol ?? "rol atanmamış"}
        bildirimSayisi={bildirimSayisi}
        gizliMenuAnahtarlari={gizliMenuAnahtarlari}
      >
        {children}
      </PanelSidebar>
    </QueryProvider>
  );
}
