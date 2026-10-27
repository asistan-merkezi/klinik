import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { eq } from "drizzle-orm";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { sema, withTenant } from "@/lib/db";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MuhasebeEntegrasyonDurum } from "@/types/muhasebe-entegrasyon";
import { MuhasebeSyncFormu } from "./muhasebe-sync-formu";
import { formatDateTime } from "@/lib/datetime";

export default async function MuhasebeSyncSayfasi() {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") {
    redirect("/giris");
  }

  const duzenlenebilir = ctx.rol === "klinik_admin";

  // Client secret burada BİLEREK seçilmiyor (kolon uygulama rolüne kapalı); ekrana hiçbir zaman taşınmaz.
  let durum: MuhasebeEntegrasyonDurum | null = null;
  if (ctx.tenantId) {
    const satir = await withTenant(tenantGerekli(ctx), (tx) =>
      tx
        .select({
          parasut_client_id: sema.klinikMuhasebeEntegrasyonu.parasutClientId,
          parasut_company_id: sema.klinikMuhasebeEntegrasyonu.parasutCompanyId,
          baglanti_durumu: sema.klinikMuhasebeEntegrasyonu.baglantiDurumu,
          updated_at: sema.klinikMuhasebeEntegrasyonu.updatedAt,
        })
        .from(sema.klinikMuhasebeEntegrasyonu)
        .where(eq(sema.klinikMuhasebeEntegrasyonu.klinikId, ctx.tenantId!))
        .limit(1)
    );
    durum = (satir[0] as MuhasebeEntegrasyonDurum | undefined) ?? null;
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={RefreshCw}
          title="Muhasebe Sync"
          description="Muhasebe bölümünü (fatura kesimi) senkronize edecek Paraşüt API bağlantısı."
        />

        <Card>
          <CardHeader>
            <CardTitle>Bağlantı Durumu</CardTitle>
            <CardAction>
              <StatusBadge tone={durum?.baglanti_durumu === "baglandi" ? "emerald" : "slate"}>
                {durum?.baglanti_durumu === "baglandi" ? "Bağlandı" : "Bekliyor"}
              </StatusBadge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {durum?.updated_at && (
              <p className="text-xs text-muted-foreground">
                Son güncelleme: {formatDateTime(durum.updated_at)}
              </p>
            )}

            {duzenlenebilir ? (
              <MuhasebeSyncFormu durum={durum} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Bu bilgileri yalnızca klinik yöneticisi düzenleyebilir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
