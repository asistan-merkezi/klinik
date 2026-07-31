import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import type { TedaviProtokoluSatir } from "@/types/tedavi-protokolu";
import { YeniProtokolDialog } from "./yeni-protokol-dialog";
import { ProtokolSatiri } from "./protokol-satiri";

export default async function TedaviProtokolleriSayfasi() {
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

  const [tedaviSonucu, protokolSonucu] = await Promise.all([
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("tedavi_protokolu")
      .select(
        "id, ad, aciklama, aktif, tedavi_protokolu_adimi(id, sira, adim_notu, islem_tanimi:islem_tanimi_id(id, ad))"
      )
      .order("ad")
      .order("sira", { referencedTable: "tedavi_protokolu_adimi" })
      .returns<TedaviProtokoluSatir[]>(),
  ]);

  const tedaviler: SecenekSatir[] = (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad }));
  const protokoller = protokolSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Tedavi Protokolleri</h1>
            <p className="text-sm text-muted-foreground">
              Sıralı tedavi adımlarından oluşan protokol şablonlarını görüntüle ve yönet.
            </p>
          </div>
          {duzenlenebilir && (
            <div className="shrink-0">
              <YeniProtokolDialog tedaviler={tedaviler} />
            </div>
          )}
        </header>

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı Protokoller</CardTitle>
          </CardHeader>
          <CardContent>
            {protokolSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!protokolSonucu.error && protokoller.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz tedavi protokolü yok.</p>
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
