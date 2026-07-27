import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { IslemFormu } from "./islem-formu";
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

  const [kategoriSonucu, cihazSonucu, islemSonucu] = await Promise.all([
    supabase.from("islem_kategori").select("id, ad").order("ad"),
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("islem_tanimi")
      .select(
        "id, ad, fiyat, kdv_orani, parasut_hizmet_kodu, aktif, islem_kategori(ad), cihaz:gerekli_cihaz_id(ad)"
      )
      .order("ad")
      .returns<IslemTanimiSatir[]>(),
  ]);

  const kategoriler: SecenekSatir[] = (kategoriSonucu.data ?? []).map((k) => ({
    id: k.id,
    ad: k.ad,
  }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const islemler = islemSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">İşlem Tanımları</h1>
          <p className="text-sm text-muted-foreground">
            Fiyat kataloğunu görüntüle ve yönet.
          </p>
        </header>

        {duzenlenebilir ? (
          kategoriler.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  İşlem tanımı ekleyebilmek için önce en az bir işlem kategorisi gerekli.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Yeni İşlem Tanımı</CardTitle>
              </CardHeader>
              <CardContent>
                <IslemFormu kategoriler={kategoriler} cihazlar={cihazlar} />
              </CardContent>
            </Card>
          )
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Kayıtlı İşlemler</CardTitle>
          </CardHeader>
          <CardContent>
            {islemSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!islemSonucu.error && islemler.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz işlem tanımı yok.</p>
            )}
            {!islemSonucu.error && islemler.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {islemler.map((islem) => (
                  <IslemSatiri
                    key={islem.id}
                    islem={islem}
                    kategoriler={kategoriler}
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
