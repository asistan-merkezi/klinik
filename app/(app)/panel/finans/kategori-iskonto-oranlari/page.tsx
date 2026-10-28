import { Percent } from "lucide-react";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { IskontoOranlari } from "@/types/iskonto-oranlari";
import { IskontoOranlariFormu } from "./iskonto-oranlari-formu";

export default async function IskontoOranlariSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  const satir = (await withTenant(bag, (tx) => tx.select().from(sema.iskontoOranlari).where(eq(sema.iskontoOranlari.klinikId, bag.tenantId)).limit(1)))[0];
  const oranlar: IskontoOranlari | null = satir
    ? { vita_pct: Number(satir.vitaPct), plus_pct: Number(satir.plusPct), elit_pct: Number(satir.elitPct), prime_pct: Number(satir.primePct) }
    : null;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Kategori / İskonto Oranları"
          description="Hasta kategorisine (Vita/Plus/Elit/Prime) göre tedavi fiyatına otomatik uygulanacak iskonto yüzdeleri — bir tedavide o kademe için özel fiyat girilmemişse burada tanımlanan oran Vita fiyatına uygulanır."
          icon={Percent}
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kademe Yüzdeleri</CardTitle>
          </CardHeader>
          <CardContent>
            {duzenlenebilir ? (
              <IskontoOranlariFormu oranlar={oranlar} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Bu oranları yalnızca klinik yöneticisi düzenleyebilir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
