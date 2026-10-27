import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { withTenant, sema } from "@/lib/db";
import { PanelSidebar } from "@/components/panel/sidebar";
import { QueryProvider } from "@/components/panel/query-provider";
import { RandevuBildirimleri } from "@/components/panel/randevu-bildirimleri";
import { bildirimSayisi } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-sayisi";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN, SIDEBAR_GIZLI_BOS } from "@/lib/panel/menu-gruplari";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await oturumBaglami();
  // Oturum yok ya da hasta oturumu: panel yalnız personeldir (proxy de ayırır; burası savunma derinliği).
  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }

  // Bildirim zili — sadece klinik_admin ve resepsiyon görür (Hastalar listesi ve Ana Ekran ile aynı kural, bkz. bildirim-sayisi.ts).
  const bildirimGorulebilir = ctx.rol === "klinik_admin" || ctx.rol === "resepsiyon";

  // Klinik bağlamı olmayan oturum (super_admin) varsayılan görünümle açılır: klinik verisi sorgulanmaz.
  let klinik: { ad: string; logo_url: string | null; logo_url_koyu: string | null; marka_renkleri: unknown } | null = null;
  let bildirimSayisiDegeri: number | undefined;
  let ayarlar: Record<string, unknown> | null = null;
  let departman: string | null = null;

  if (ctx.tenantId) {
    const bag = tenantGerekli(ctx);
    const [klinikSatiri, ayarSatiri, personelSatiri, sayi] = await Promise.all([
      withTenant(bag, (tx) =>
        tx
          .select({ ad: sema.klinik.ad, logoUrl: sema.klinik.logoUrl, logoUrlKoyu: sema.klinik.logoUrlKoyu, markaRenkleri: sema.klinik.markaRenkleri })
          .from(sema.klinik)
          .where(eq(sema.klinik.id, ctx.tenantId!))
          .limit(1)
      ),
      withTenant(bag, (tx) => tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, ctx.tenantId!)).limit(1)),
      // Sidebar Menü Görünürlüğü ROL değil kullanıcının bağlı olduğu pozisyonun DEPARTMANI bazlı — personel.pozisyon_id üzerinden çözülür.
      withTenant(bag, (tx) =>
        tx
          .select({ grup: sema.pozisyonlar.grup })
          .from(sema.personel)
          .leftJoin(sema.pozisyonlar, eq(sema.pozisyonlar.id, sema.personel.pozisyonId))
          .where(eq(sema.personel.kullaniciId, ctx.userId))
          .limit(1)
      ),
      bildirimGorulebilir ? bildirimSayisi(bag) : Promise.resolve(undefined),
    ]);
    const k = klinikSatiri[0];
    klinik = k ? { ad: k.ad, logo_url: k.logoUrl, logo_url_koyu: k.logoUrlKoyu, marka_renkleri: k.markaRenkleri } : null;
    ayarlar = (ayarSatiri[0]?.ayarlar as Record<string, unknown> | undefined) ?? null;
    departman = personelSatiri[0]?.grup ?? null;
    bildirimSayisiDegeri = sayi;
  }

  // Ayarlar > Yetkilendirme'deki Sidebar Menü Görünürlüğü — bu departman hiç özelleştirilmediyse SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN'a,
  // departman hiç çözülemediyse (personel kaydı/pozisyon_id yok) tam görünür varsayılana düşer.
  const sidebarGizli = ayarlar?.sidebar_gizli as Record<string, string[]> | undefined;
  const gizliMenuAnahtarlari = departman
    ? (sidebarGizli?.[departman] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[departman] ?? SIDEBAR_GIZLI_BOS)
    : SIDEBAR_GIZLI_BOS;

  return (
    <QueryProvider>
      <PanelSidebar
        klinik={(klinik as never) ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
        kullaniciAdi={ctx.adSoyad ?? ctx.eposta ?? ""}
        kullaniciRolu={ctx.rol}
        bildirimSayisi={bildirimSayisiDegeri}
        gizliMenuAnahtarlari={gizliMenuAnahtarlari}
      >
        {children}
      </PanelSidebar>
      <RandevuBildirimleri kullaniciId={ctx.userId} rol={ctx.rol} />
    </QueryProvider>
  );
}
