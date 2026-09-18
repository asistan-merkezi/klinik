import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { PanelSidebar } from "@/components/panel/sidebar";
import { QueryProvider } from "@/components/panel/query-provider";
import { bildirimSayisiGetir } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-sayisi";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN, SIDEBAR_GIZLI_BOS } from "@/lib/panel/menu-gruplari";

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
  const [{ data: klinik }, bildirimSayisi, { data: klinikAyarlar }, { data: personelKaydi }] = await Promise.all([
    supabase
      .from("klinik")
      .select("ad, logo_url, logo_url_koyu, marka_renkleri, plan_turu")
      .eq("id", kullanici?.klinik_id ?? "")
      .maybeSingle(),
    bildirimGorulebilir ? bildirimSayisiGetir(supabase) : Promise.resolve(undefined),
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", kullanici?.klinik_id ?? "").maybeSingle(),
    // Sidebar Menü Görünürlüğü artık ROL değil kullanıcının bağlı olduğu
    // pozisyonun DEPARTMANI bazlı — personel.pozisyon_id üzerinden çözülür.
    supabase
      .from("personel")
      .select("pozisyon_id, pozisyonlar(grup)")
      .eq("kullanici_id", user.id)
      .maybeSingle<{ pozisyon_id: string | null; pozisyonlar: { grup: string } | null }>(),
  ]);

  const departman = personelKaydi?.pozisyonlar?.grup ?? null;

  // Ayarlar > Yetkilendirme'deki Sidebar Menü Görünürlüğü — bu departman hiç
  // özelleştirilmediyse SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN'a, departman hiç
  // çözülemediyse (personel kaydı/pozisyon_id yok) tam görünür varsayılana düşer.
  const sidebarGizli = (klinikAyarlar?.ayarlar as Record<string, unknown> | null)?.sidebar_gizli as
    | Record<string, string[]>
    | undefined;
  const gizliMenuAnahtarlari = departman
    ? (sidebarGizli?.[departman] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[departman] ?? SIDEBAR_GIZLI_BOS)
    : SIDEBAR_GIZLI_BOS;

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
