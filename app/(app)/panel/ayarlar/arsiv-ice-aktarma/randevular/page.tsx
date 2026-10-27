import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { odaSecenekleriGetir, tumTerapistSecenekleriGetir } from "@/lib/randevu/sorgular";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RandevularSihirbazi } from "./sihirbaz";

export default async function RandevularArsivIceAktarmaSayfasi() {
  await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar/arsiv-ice-aktarma" });
  const { bag } = await panelBaglami();

  const { terapistler, odalar, islemler } = await withTenant(bag, async (tx) => ({
    // Arşivde ayrılmış terapistin eski kayıtları meşru olabilir: çıkış tarihi süzülmez (eski davranış).
    terapistler: (await tumTerapistSecenekleriGetir(tx)).map((t) => ({ id: t.id, ad: t.ad === "—" ? "İsimsiz terapist" : t.ad })),
    odalar: await odaSecenekleriGetir(tx),
    islemler: await tx.select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad }).from(sema.islemTanimi).where(eq(sema.islemTanimi.aktif, true)).orderBy(asc(sema.islemTanimi.ad)),
  }));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          icon={CalendarClock}
          title="Randevu / Seans Geçmişi"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Hastalar bölümü tamamlandıktan sonra kullanın — her satır telefon numarasına göre mevcut bir hastayla eşleştirilir. Aktarılan randevular geçmiş/tamamlanmış olarak işaretlenir, günlük KPI ve doluluk raporlarını etkilemez."
        />

        <Card>
          <CardHeader>
            <CardTitle>Randevu İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <RandevularSihirbazi terapistler={terapistler} odalar={odalar} islemler={islemler} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
