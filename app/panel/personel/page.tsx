import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonelSatir } from "@/types/personel";

export default async function PersonelSayfasi() {
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

  const yonetici = kullanici?.rol === "klinik_admin";

  const [personelSonucu, terapistSonucu] = await Promise.all([
    supabase
      .from("personel")
      .select("id, ad_soyad, gorev, maas, aktif")
      .order("ad_soyad")
      .returns<PersonelSatir[]>(),
    supabase.from("terapist").select("id, personel_id"),
  ]);

  const personelListesi = personelSonucu.data ?? [];
  const terapistPersonelIdleri = new Set((terapistSonucu.data ?? []).map((t) => t.personel_id));

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Personel</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Çalışanlar; terapistler için performans ve maaş hesaplama.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/panel">Panele dön</Link>} />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Çalışanlar</CardTitle>
          </CardHeader>
          <CardContent>
            {personelSonucu.error && (
              <p className="text-sm text-red-600">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!personelSonucu.error && personelListesi.length === 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Henüz personel kaydı yok.</p>
            )}
            {!personelSonucu.error && personelListesi.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {personelListesi.map((p) => {
                  const terapistMi = terapistPersonelIdleri.has(p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="flex flex-col">
                        <span className={`font-medium ${p.aktif ? "" : "text-zinc-400 line-through"}`}>
                          {p.ad_soyad}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {p.gorev}
                          {yonetici && p.maas != null &&
                            ` · ${p.maas.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}`}
                        </span>
                      </div>
                      {terapistMi && (
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/panel/personel/${p.id}`}>Performans & Maaş</Link>}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
