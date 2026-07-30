import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { YeniTedaviDialog } from "./yeni-tedavi-dialog";
import { IslemSatiri } from "./islem-satiri";

export default async function IslemlerSayfasi() {
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

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const [cihazSonucu, islemSonucu] = await Promise.all([
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("islem_tanimi")
      .select("id, ad, fiyat, kdv_orani, muhasebe_hizmet_ismi, aktif, cihaz:gerekli_cihaz_id(ad)")
      .order("ad")
      .returns<IslemTanimiSatir[]>(),
  ]);

  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const islemler = islemSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Tedavi Tanımları</h1>
            <p className="text-sm text-muted-foreground">
              Fiyat kataloğunu görüntüle ve yönet.
            </p>
          </div>
          {duzenlenebilir && (
            <div className="shrink-0">
              <YeniTedaviDialog cihazlar={cihazlar} />
            </div>
          )}
        </header>

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı Tedaviler</CardTitle>
          </CardHeader>
          <CardContent>
            {islemSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!islemSonucu.error && islemler.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz tedavi tanımı yok.</p>
            )}
            {!islemSonucu.error && islemler.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {islemler.map((islem) => (
                  <IslemSatiri
                    key={islem.id}
                    islem={islem}
                    cihazlar={cihazlar}
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
