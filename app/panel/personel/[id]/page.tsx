import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HakedisSatir, PersonelDetay, TerapistAyarlari } from "@/types/personel";
import { ayAraligi, gunAraligi, haftaAraligi } from "@/lib/utils";
import { maasHesapla } from "@/lib/maas";
import { MaasFormu } from "./maas-formu";
import { HakedisFormu } from "./hakedis-formu";

export default async function PersonelDetaySayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const { id } = await params;
  const { ay: ayParam } = await searchParams;
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

  const { data: personel } = await supabase
    .from("personel")
    .select("id, ad_soyad, gorev, maas, aktif, kullanici_id")
    .eq("id", id)
    .single<PersonelDetay>();

  if (!personel) {
    notFound();
  }

  const yonetici = kullanici?.rol === "klinik_admin";
  const kendisi = personel.kullanici_id === user.id;

  if (!yonetici && !kendisi) {
    notFound();
  }

  const { data: terapist } = await supabase
    .from("terapist")
    .select("id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
    .eq("personel_id", id)
    .maybeSingle<TerapistAyarlari>();

  const gun = gunAraligi();
  const hafta = haftaAraligi();
  const ay = ayAraligi(ayParam);

  let gunSayisi = 0;
  let haftaSayisi = 0;
  let aySayisi = 0;
  let hakedisler: HakedisSatir[] = [];
  let hakedisToplami = 0;
  let hesap: ReturnType<typeof maasHesapla> | null = null;

  if (terapist) {
    const [gunSonucu, haftaSonucu, aySonucu, hakedisSonucu] = await Promise.all([
      supabase
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", terapist.id)
        .eq("durum", "geldi")
        .gte("baslangic", gun.baslangic)
        .lt("baslangic", gun.bitis),
      supabase
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", terapist.id)
        .eq("durum", "geldi")
        .gte("baslangic", hafta.baslangic)
        .lt("baslangic", hafta.bitis),
      supabase
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", terapist.id)
        .eq("durum", "geldi")
        .gte("baslangic", ay.baslangic)
        .lt("baslangic", ay.bitis),
      supabase
        .from("personel_ekstra_hakedis")
        .select("id, tur, tutar, tarih, aciklama")
        .eq("personel_id", id)
        .gte("tarih", ay.baslangic.slice(0, 10))
        .lt("tarih", ay.bitis.slice(0, 10))
        .order("tarih", { ascending: false })
        .returns<HakedisSatir[]>(),
    ]);

    gunSayisi = gunSonucu.count ?? 0;
    haftaSayisi = haftaSonucu.count ?? 0;
    aySayisi = aySonucu.count ?? 0;
    hakedisler = hakedisSonucu.data ?? [];
    hakedisToplami = hakedisler.reduce((acc, h) => acc + h.tutar, 0);

    hesap = maasHesapla(
      {
        maas_hesaplama_modeli: terapist.maas_hesaplama_modeli,
        sabit_maas: personel.maas,
        prim_sabit_tutar: terapist.prim_sabit_tutar,
        baraj_seans_sayisi: terapist.baraj_seans_sayisi,
        baraj_bonus_tutari: terapist.baraj_bonus_tutari,
      },
      aySayisi,
      hakedisToplami
    );
  }

  const TUR_ETIKET: Record<HakedisSatir["tur"], string> = {
    yol: "Yol",
    yemek: "Yemek",
    mesai: "Fazla Mesai",
    diger: "Diğer",
  };

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{personel.ad_soyad}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{personel.gorev}</p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/personel">Personele dön</Link>} />
        </header>

        {!terapist && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Bu personel terapist değil, performans/prim takibi yapılmıyor.
              </p>
            </CardContent>
          </Card>
        )}

        {terapist && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Performans</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{gunSayisi}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Bugün</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{haftaSayisi}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">Bu hafta</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{aySayisi}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{ay.etiket}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Maaş Hesabı — {ay.etiket}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/panel/personel/${id}?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/panel/personel/${id}?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {hesap && (
                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-600 dark:text-zinc-400">Taban</dt>
                      <dd>{hesap.taban.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-600 dark:text-zinc-400">Prim/Bonus</dt>
                      <dd>{hesap.prim.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-600 dark:text-zinc-400">Ekstra Hakedişler</dt>
                      <dd>
                        {hesap.ekstra_toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-200 pt-2 font-semibold dark:border-zinc-800">
                      <dt>Toplam</dt>
                      <dd>{hesap.toplam.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</dd>
                    </div>
                    <p className="text-xs text-zinc-500">{hesap.aciklama}</p>
                  </dl>
                )}
              </CardContent>
            </Card>

            {yonetici && (
              <Card>
                <CardHeader>
                  <CardTitle>Maaş Ayarları</CardTitle>
                </CardHeader>
                <CardContent>
                  <MaasFormu
                    key={`${personel.maas}|${terapist.maas_hesaplama_modeli}|${terapist.prim_sabit_tutar}|${terapist.baraj_seans_sayisi}|${terapist.baraj_bonus_tutari}`}
                    personel={personel}
                    terapist={terapist}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Ekstra Hakedişler — {ay.etiket}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {yonetici && <HakedisFormu personelId={id} />}
                {hakedisler.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Bu ay için hakediş kaydı yok.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                    {hakedisler.map((h) => (
                      <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{TUR_ETIKET[h.tur]}</span>
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            {new Date(h.tarih).toLocaleDateString("tr-TR")}
                            {h.aciklama && ` · ${h.aciklama}`}
                          </span>
                        </div>
                        <span>{h.tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
