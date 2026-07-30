import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import type { PaketSatir } from "@/types/paket";
import { YeniPaketDialog } from "./yeni-paket-dialog";
import { PaketSatiri } from "./paket-satiri";

export default async function PaketlerSayfasi() {
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

  const [islemTanimiSonucu, paketSonucu] = await Promise.all([
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("paket")
      .select("id, ad, seans_sayisi, gecerlilik_gun, fiyat, kdv_orani, aktif, islem_tanimi(ad)")
      .order("ad")
      .returns<PaketSatir[]>(),
  ]);

  const islemTanimlari: SecenekSatir[] = (islemTanimiSonucu.data ?? []).map((i) => ({
    id: i.id,
    ad: i.ad,
  }));
  const paketler = paketSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Paketler</h1>
            <p className="text-sm text-muted-foreground">
              Hastalara satılabilecek seans paketlerini yönet.
            </p>
          </div>
          {duzenlenebilir && (
            <div className="shrink-0">
              <YeniPaketDialog islemTanimlari={islemTanimlari} />
            </div>
          )}
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Kayıtlı Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {paketSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!paketSonucu.error && paketler.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz paket yok.</p>
            )}
            {!paketSonucu.error && paketler.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {paketler.map((paket) => (
                  <PaketSatiri
                    key={paket.id}
                    paket={paket}
                    islemTanimlari={islemTanimlari}
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
