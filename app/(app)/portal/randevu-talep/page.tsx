import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gecerliHasta } from "@/lib/auth/gecerli-hasta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import { RandevuTalepFormu } from "./randevu-talep-formu";

export default async function RandevuTalepSayfasi() {
  const oturum = await gecerliHasta();
  if (!oturum) {
    redirect("/portal/giris");
  }

  const supabase = await createClient();

  const { data: tedaviler } = await supabase
    .from("islem_tanimi")
    .select("id, ad")
    .eq("aktif", true)
    .order("ad")
    .returns<SecenekSatir[]>();

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
            <RandevuTalepFormu tedaviler={tedaviler ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
