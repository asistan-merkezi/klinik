import { redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/lib/db";
import { gecerliHastaBaglami } from "@/lib/auth/gecerli-hasta";
import { portalBilgilerimGetir } from "@/lib/portal/sorgular";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BilgilerFormu } from "./bilgiler-formu";

export default async function PortalBilgilerimSayfasi() {
  const oturum = await gecerliHastaBaglami();
  if (!oturum) {
    redirect("/portal/giris");
  }

  // hastaId oturumdan; RLS yalnız bu hastanın satırlarını gösterir.
  const { hasta, hassas } = await withTenant(oturum.bag, (tx) => portalBilgilerimGetir(tx, oturum.hastaId));

  if (!hasta) {
    redirect("/portal");
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Detaylı Bilgilerim</h1>
            <p className="text-sm text-muted-foreground">
              Adres, acil durum kişisi ve sağlık geçmişinizi güncelleyin.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/portal">Portala dön</Link>} />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Bilgilerim</CardTitle>
          </CardHeader>
          <CardContent>
            <BilgilerFormu hasta={hasta} hassas={hassas} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
