import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KaynakSatir } from "@/types/kaynak";
import { KaynakFormu } from "./kaynak-formu";
import { KaynakListesi } from "./kaynak-listesi";

export default async function KaynaklarSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [odaSonucu, cihazSonucu] = await Promise.all([
    supabase.from("oda").select("id, ad, aktif").order("ad").returns<KaynakSatir[]>(),
    supabase.from("cihaz").select("id, ad, aktif, adet").order("ad").returns<KaynakSatir[]>(),
  ]);

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
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <KaynakFormu tablo="oda" etiket="Oda" />
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
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <KaynakFormu tablo="cihaz" etiket="Cihaz" />
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
