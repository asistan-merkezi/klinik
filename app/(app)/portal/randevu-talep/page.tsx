import { redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/lib/db";
import { gecerliHastaBaglami } from "@/lib/auth/gecerli-hasta";
import { portalTedaviSecenekleriGetir } from "@/lib/portal/sorgular";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RandevuTalepFormu } from "./randevu-talep-formu";

export default async function RandevuTalepSayfasi() {
  const oturum = await gecerliHastaBaglami();
  if (!oturum) {
    redirect("/portal/giris");
  }

  const tedaviler = await withTenant(oturum.bag, (tx) => portalTedaviSecenekleriGetir(tx));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Randevu Talep Et</h1>
            <p className="text-sm text-muted-foreground">
              İstediğiniz tedavi ve tarihi belirtin, kliniğiniz uygun terapist/saati atayıp onaylayacak. Bu kesin
              bir randevu OLUŞTURMAZ, bir talep gönderir.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/portal">Portala dön</Link>} />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Talep</CardTitle>
          </CardHeader>
          <CardContent>
            <RandevuTalepFormu tedaviler={tedaviler} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
