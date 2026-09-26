import { redirect } from "next/navigation";
import Link from "next/link";
import { CirclePlus, Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuSatir, IslemTanimiSatir } from "@/types/islem-tanimi";
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

  const [cihazSonucu, pozisyonSonucu, islemSonucu, sablonSonucu] = await Promise.all([
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("pozisyonlar").select("id, ad").eq("aktif", true).order("sira"),
    supabase
      .from("islem_tanimi")
      .select(
        "id, ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi, sure_dakika, aktif, adimlar:islem_tanimi_adim(id, ad, sure_dakika, gerekli_cihaz_id, uygulayici_pozisyon_id, sira, cihaz:gerekli_cihaz_id(ad), pozisyon:uygulayici_pozisyon_id(ad))"
      )
      .order("ad")
      .order("sira", { referencedTable: "islem_tanimi_adim" })
      .returns<IslemTanimiSatir[]>(),
    supabase
      .from("islem_adimi_sablonu")
      .select("id, ad, uygulayici_pozisyon_id, sure_dakika")
      .eq("aktif", true)
      .order("ad")
      .returns<IslemAdimiSablonuSatir[]>(),
  ]);

  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const pozisyonlar: SecenekSatir[] = (pozisyonSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));
  const islemler = islemSonucu.data ?? [];
  const sablonlar = sablonSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Tedavi Tanımları"
          description="Fiyat kataloğunu görüntüle ve yönet."
          icon={Stethoscope}
          actions={
            duzenlenebilir && (
              <div className="flex flex-col items-end gap-2">
                <YeniTedaviDialog cihazlar={cihazlar} pozisyonlar={pozisyonlar} sablonlar={sablonlar} />
                <Button
                  variant="clinical"
                  nativeButton={false}
                  render={
                    <Link href="/panel/islemler/tanimlamalar">
                      <CirclePlus /> İşlem Tanımlama
                    </Link>
                  }
                />
              </div>
            )
          }
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
              <TedaviListesi
                islemler={islemler}
                cihazlar={cihazlar}
                pozisyonlar={pozisyonlar}
                sablonlar={sablonlar}
                duzenlenebilir={duzenlenebilir}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
