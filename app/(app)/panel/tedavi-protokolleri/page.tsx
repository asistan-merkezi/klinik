import { ListOrdered } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { TedaviProtokoluSatir } from "@/types/tedavi-protokolu";
import { YeniProtokolDialog } from "./yeni-protokol-dialog";
import { ProtokolSatiri } from "./protokol-satiri";

export default async function TedaviProtokolleriSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  let tedaviler: SecenekSatir[] = [];
  let protokoller: TedaviProtokoluSatir[] = [];
  let hata = false;
  try {
    ({ tedaviler, protokoller } = await withTenant(bag, async (tx) => {
      const t = await tx.select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad }).from(sema.islemTanimi).where(eq(sema.islemTanimi.aktif, true)).orderBy(asc(sema.islemTanimi.ad));
      const p = await tx.select().from(sema.tedaviProtokolu).orderBy(asc(sema.tedaviProtokolu.ad));
      const adimlar = await tx
        .select({ a: sema.tedaviProtokoluAdimi, tid: sema.islemTanimi.id, tad: sema.islemTanimi.ad })
        .from(sema.tedaviProtokoluAdimi)
        .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.tedaviProtokoluAdimi.islemTanimiId))
        .orderBy(asc(sema.tedaviProtokoluAdimi.sira));
      return {
        tedaviler: t,
        protokoller: p.map((x): TedaviProtokoluSatir => ({
          id: x.id,
          ad: x.ad,
          aciklama: x.aciklama,
          aktif: x.aktif,
          tedavi_protokolu_adimi: adimlar
            .filter((y) => y.a.tedaviProtokoluId === x.id)
            .map((y) => ({ id: y.a.id, sira: y.a.sira, adim_notu: y.a.adimNotu, islem_tanimi: y.tid ? { id: y.tid, ad: y.tad ?? "" } : null })),
        })),
      };
    }));
  } catch (e) {
    console.error("Tedavi protokolleri çekilemedi:", e);
    hata = true;
  }
  const protokolSonucu = { error: hata };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Tedavi Protokolleri"
          description="Sıralı tedavi adımlarından oluşan protokol şablonlarını görüntüle ve yönet."
          icon={ListOrdered}
          actions={duzenlenebilir && <YeniProtokolDialog tedaviler={tedaviler} />}
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı Protokoller</CardTitle>
          </CardHeader>
          <CardContent>
            {protokolSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!protokolSonucu.error && protokoller.length === 0 && (
              <EmptyState icon={ListOrdered} title="Henüz tedavi protokolü yok." compact />
            )}
            {!protokolSonucu.error && protokoller.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {protokoller.map((protokol) => (
                  <ProtokolSatiri
                    key={protokol.id}
                    protokol={protokol}
                    tedaviler={tedaviler}
                    duzenlenebilir={duzenlenebilir}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
