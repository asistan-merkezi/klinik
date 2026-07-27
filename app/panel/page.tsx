import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir } from "@/types/randevu";
import { gunAraligi } from "@/lib/utils";
import { cikisYap } from "./actions";

const DURUM_ETIKET: Record<RandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
};

export default async function PanelSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("ad_soyad, rol")
    .eq("id", user.id)
    .single();

  const { baslangic, bitis } = gunAraligi();
  const { data: randevular, error } = await supabase
    .from("randevu")
    .select(
      "id, baslangic, bitis, durum, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
    )
    .gte("baslangic", baslangic)
    .lt("baslangic", bitis)
    .order("baslangic")
    .returns<RandevuSatir[]>();

  if (error) {
    console.error("Bugünkü randevular çekilemedi:", error);
  }

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Muayene Asistanı</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {kullanici?.ad_soyad ?? user.email} — {kullanici?.rol ?? "rol atanmamış"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button nativeButton={false} render={<Link href="/panel/musteriler">Müşteriler</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/randevular">Randevular</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/kaynaklar">Oda/Cihaz</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/islemler">İşlemler</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/paketler">Paketler</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/personel">Personel</Link>} />
            <Button nativeButton={false} render={<Link href="/panel/tablet">Tablet</Link>} />
            <form action={cikisYap}>
              <Button type="submit" variant="outline">
                Çıkış yap
              </Button>
            </form>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Bugünkü Randevular</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="text-sm text-red-600">
                Bir hata oluştu, lütfen tekrar deneyin.
              </p>
            )}
            {!error && (!randevular || randevular.length === 0) && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Bugün için randevu yok.</p>
            )}
            {!error && randevular && randevular.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {randevular.map((randevu) => (
                  <li key={randevu.id} className="flex items-center justify-between py-3 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{randevu.musteri?.ad_soyad ?? "—"}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {randevu.terapist?.personel?.ad_soyad ?? "—"} · {randevu.oda?.ad ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span>
                        {new Date(randevu.baslangic).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {DURUM_ETIKET[randevu.durum]}
                      </span>
                    </div>
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
