import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { sema, withTenant } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { Pozisyon } from "@/types/pozisyon";
import { SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN } from "@/lib/panel/menu-gruplari";
import { SidebarYetkiFormu } from "./sidebar-yetki-formu";

export default async function YetkilendirmeSayfasi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }
  const duzenlenebilir = ctx.rol === "klinik_admin";

  let pozisyonlar: Pick<Pozisyon, "ad" | "grup" | "sira" | "aktif">[] = [];
  let klinikAyarlar: { ayarlar: unknown } | null = null;
  if (ctx.tenantId) {
    const klinikId = ctx.tenantId;
    const [poz, ayar] = await withTenant(tenantGerekli(ctx), (tx) =>
      Promise.all([
        // Departman sekmeleri Personel Tanımlama'daki departmanlarla birebir aynı olsun diye aynı kaynaktan (pozisyonlar.grup) türetiliyor.
        tx
          .select({ ad: sema.pozisyonlar.ad, grup: sema.pozisyonlar.grup, sira: sema.pozisyonlar.sira, aktif: sema.pozisyonlar.aktif })
          .from(sema.pozisyonlar)
          .orderBy(asc(sema.pozisyonlar.sira)),
        tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, klinikId)).limit(1),
      ])
    );
    pozisyonlar = poz;
    klinikAyarlar = ayar[0] ?? null;
  }

  const liste = pozisyonlar ?? [];

  const departmanSiralari = new Map<string, number>();
  for (const poz of liste) {
    const mevcut = departmanSiralari.get(poz.grup);
    if (mevcut === undefined || poz.sira < mevcut) departmanSiralari.set(poz.grup, poz.sira);
  }
  const departmanAdlari = [...departmanSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  // Başlığın yanında görünen "(İşletme Ortağı, Klinik Yöneticisi)" gibi liste —
  // yalnız aktif pozisyonlar, Personel Tanımlama'daki sırayla.
  const departmanPozisyonlari = new Map<string, string[]>();
  for (const poz of [...liste].filter((p) => p.aktif).sort((a, b) => a.sira - b.sira)) {
    const mevcut = departmanPozisyonlari.get(poz.grup) ?? [];
    mevcut.push(poz.ad);
    departmanPozisyonlari.set(poz.grup, mevcut);
  }
  const departmanRolleri: Record<string, string[]> = Object.fromEntries(
    departmanAdlari.map((d) => [d, departmanPozisyonlari.get(d) ?? []])
  );

  const sidebarGizliKayitli =
    ((klinikAyarlar?.ayarlar as Record<string, unknown> | null)?.sidebar_gizli as
      | Record<string, string[]>
      | undefined) ?? {};
  const baslangicGizli: Record<string, string[]> = Object.fromEntries(
    departmanAdlari.map((d) => [d, sidebarGizliKayitli[d] ?? SIDEBAR_GIZLI_VARSAYILAN_DEPARTMAN[d] ?? []])
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={ShieldCheck}
          title="Yetkilendirme"
          description="Departmanlara göre sidebar menü erişimini yönetin. Departman/pozisyon eklemek, çıkarmak ve aktif-pasif etmek Ayarlar → Personel Tanımlama'dan yapılır."
        />

        <Card>
          <CardHeader>
            <CardTitle>Departman Yetkilendirmesi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Bir departman seçip hangi menülerin o departmandaki kişilere görüneceğini belirleyin. Bir kişinin
              hangi departmanda sayıldığı, Personel Tanımlama&apos;da bağlı olduğu pozisyona göre belirlenir.
            </p>
            <SidebarYetkiFormu
              departmanlar={departmanAdlari}
              departmanRolleri={departmanRolleri}
              baslangicGizli={baslangicGizli}
              duzenlenebilir={duzenlenebilir}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
