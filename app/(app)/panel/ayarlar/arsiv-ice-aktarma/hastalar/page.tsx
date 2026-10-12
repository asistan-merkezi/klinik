import Link from "next/link";
import { Users } from "lucide-react";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HastalarSihirbazi } from "./sihirbaz";

export default async function HastalarArsivIceAktarmaSayfasi() {
  await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar/arsiv-ice-aktarma" });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Users}
          title="Hastalar"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Eski programdaki hasta kayıtlarını Excel/CSV dosyasından toplu olarak aktarın. Bu adım, randevu ve ödeme/paket geçmişini aktarmadan önce tamamlanmalı."
        />

        <Card>
          <CardHeader>
            <CardTitle>Hasta İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <HastalarSihirbazi />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
