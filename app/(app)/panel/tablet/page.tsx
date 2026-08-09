import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TabletOdaSecimSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const { data: odalar, error } = await supabase
    .from("oda")
    .select("id, ad")
    .eq("aktif", true)
    .order("ad");

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Tablet Ekranı</h1>
            <p className="text-sm text-muted-foreground">
              Canlı görüntülemek istediğin odayı seç.
            </p>
          </div>
          {kullanici?.rol === "klinik_admin" && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href="/panel/tablet/ayarlar">
                  <Settings2 className="mr-1.5 size-4" />
                  Görünüm Ayarları
                </Link>
              }
            />
          )}
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Odalar</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!error && (!odalar || odalar.length === 0) && (
              <p className="text-sm text-muted-foreground">
                Aktif oda yok. Önce Oda/Cihaz ekranından oda ekle.
              </p>
            )}
            {!error && odalar && odalar.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {odalar.map((oda) => (
                  <li key={oda.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{oda.ad}</span>
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/panel/tablet/${oda.id}`}>Görüntüle</Link>}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
