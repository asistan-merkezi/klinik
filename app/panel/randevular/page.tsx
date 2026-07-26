import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { RandevuFormu } from "./randevu-formu";
import { DurumButonlari } from "./durum-butonlari";

const DURUM_ETIKET: Record<RandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
};

export default async function RandevularSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [randevularSonucu, musteriSonucu, terapistSonucu, odaSonucu, cihazSonucu] =
    await Promise.all([
      supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
        )
        .gte("bitis", new Date().toISOString())
        .order("baslangic")
        .limit(50)
        .returns<RandevuSatir[]>(),
      supabase.from("musteri").select("id, ad_soyad").order("ad_soyad"),
      supabase
        .from("terapist")
        .select("id, personel(ad_soyad)")
        .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    ]);

  const randevular = randevularSonucu.data ?? [];
  const musteriler: SecenekSatir[] = (musteriSonucu.data ?? []).map((m) => ({
    id: m.id,
    ad: m.ad_soyad,
  }));
  const terapistler: SecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Randevular</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Yaklaşan randevuları görüntüle ve yeni randevu oluştur.
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/panel">Panele dön</Link>}
          />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Yeni Randevu</CardTitle>
          </CardHeader>
          <CardContent>
            {musteriler.length === 0 || terapistler.length === 0 || odalar.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Randevu oluşturabilmek için önce müşteri, terapist ve oda kaydı gerekli.
              </p>
            ) : (
              <RandevuFormu
                musteriler={musteriler}
                terapistler={terapistler}
                odalar={odalar}
                cihazlar={cihazlar}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yaklaşan Randevular</CardTitle>
          </CardHeader>
          <CardContent>
            {randevularSonucu.error && (
              <p className="text-sm text-red-600">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!randevularSonucu.error && randevular.length === 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Yaklaşan randevu yok.
              </p>
            )}
            {!randevularSonucu.error && randevular.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {randevular.map((randevu) => (
                  <li
                    key={randevu.id}
                    className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{randevu.musteri?.ad_soyad ?? "—"}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {randevu.terapist?.personel?.ad_soyad ?? "—"} · {randevu.oda?.ad ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
                      <div className="flex flex-col sm:items-end">
                        <span>
                          {new Date(randevu.baslangic).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {DURUM_ETIKET[randevu.durum]}
                        </span>
                      </div>
                      <DurumButonlari randevuId={randevu.id} durum={randevu.durum} />
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
