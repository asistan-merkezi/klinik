import { asc } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KaynakSatir } from "@/types/kaynak";
import { KaynakEkleDialog } from "./kaynak-ekle-dialog";
import { KaynakListesi } from "./kaynak-listesi";

export default async function KaynaklarSayfasi() {
  const { bag } = await panelBaglami();

  let odalar: KaynakSatir[] = [];
  let cihazlar: KaynakSatir[] = [];
  let hata = false;
  try {
    ({ odalar, cihazlar } = await withTenant(bag, async (tx) => ({
      odalar: await tx.select({ id: sema.oda.id, ad: sema.oda.ad, aktif: sema.oda.aktif, kapasite: sema.oda.kapasite }).from(sema.oda).orderBy(asc(sema.oda.ad)),
      cihazlar: await tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad, aktif: sema.cihaz.aktif, adet: sema.cihaz.adet }).from(sema.cihaz).orderBy(asc(sema.cihaz.ad)),
    })));
  } catch (e) {
    console.error("Kaynaklar çekilemedi:", e);
    hata = true;
  }
  const odaSonucu = { error: hata, data: odalar };
  const cihazSonucu = { error: hata, data: cihazlar };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Oda ve Cihazlar</h1>
          <p className="text-sm text-muted-foreground">
            Muayene odalarını ve cihazları yönet.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Odalar</CardTitle>
            <CardAction>
              <KaynakEkleDialog tablo="oda" etiket="Oda" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {odaSonucu.error ? (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            ) : (
              <KaynakListesi tablo="oda" kaynaklar={odaSonucu.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cihazlar</CardTitle>
            <CardAction>
              <KaynakEkleDialog tablo="cihaz" etiket="Cihaz" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cihazSonucu.error ? (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            ) : (
              <KaynakListesi tablo="cihaz" kaynaklar={cihazSonucu.data ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
