import Link from "next/link";
import { Wallet } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { OdemePaketSihirbazi } from "./sihirbaz";

export default async function OdemePaketArsivIceAktarmaSayfasi() {
  await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar/arsiv-ice-aktarma" });
  const { bag } = await panelBaglami();

  const paketler = await withTenant(bag, (tx) => tx.select({ id: sema.paket.id, ad: sema.paket.ad }).from(sema.paket).where(eq(sema.paket.aktif, true)).orderBy(asc(sema.paket.ad)));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          icon={Wallet}
          title="Ödeme & Paket Geçmişi"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Hastalar bölümü tamamlandıktan sonra kullanın. Bu içe aktarma bir tahsilat işlemi DEĞİLDİR — Paraşüt fatura kuyruğunu tetiklemez, doğrudan geçmiş kayıt olarak eklenir."
        />

        <Card>
          <CardHeader>
            <CardTitle>Ödeme &amp; Paket İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <OdemePaketSihirbazi paketler={paketler} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
