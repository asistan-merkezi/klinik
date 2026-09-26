import { redirect } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { YeniTedaviDialog } from "./yeni-tedavi-dialog";
import { TedaviListesi } from "./tedavi-listesi";

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
      .select(
        "id, ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi, sure_dakika, aktif, adimlar:islem_tanimi_adim(id, ad, sure_dakika, gerekli_cihaz_id, sira, cihaz:gerekli_cihaz_id(ad))"
      )
      .order("ad")
      .order("sira", { referencedTable: "islem_tanimi_adim" })
      .returns<IslemTanimiSatir[]>(),
  ]);

  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const islemler = islemSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Tedavi Tanımları"
          description="Fiyat kataloğunu görüntüle ve yönet."
          icon={Stethoscope}
          actions={duzenlenebilir && <YeniTedaviDialog cihazlar={cihazlar} />}
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı Tedaviler</CardTitle>
          </CardHeader>
          <CardContent>
            {islemSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!islemSonucu.error && islemler.length === 0 && (
              <EmptyState icon={Stethoscope} title="Henüz tedavi tanımı yok." compact />
            )}
            {!islemSonucu.error && islemler.length > 0 && (
              <TedaviListesi islemler={islemler} cihazlar={cihazlar} duzenlenebilir={duzenlenebilir} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
