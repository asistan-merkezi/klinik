import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecenekSatir } from "@/types/randevu";
import type { PaketSatir } from "@/types/paket";
import { PaketFormu } from "./paket-formu";
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
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Paketler</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Müşterilere satılabilecek seans paketlerini yönet.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/panel">Panele dön</Link>} />
        </header>

        {duzenlenebilir ? (
          islemTanimlari.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Paket ekleyebilmek için önce en az bir aktif işlem tanımı gerekli.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Yeni Paket</CardTitle>
              </CardHeader>
              <CardContent>
                <PaketFormu islemTanimlari={islemTanimlari} />
              </CardContent>
            </Card>
          )
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Kayıtlı Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {paketSonucu.error && (
              <p className="text-sm text-red-600">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!paketSonucu.error && paketler.length === 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Henüz paket yok.</p>
            )}
            {!paketSonucu.error && paketler.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
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
