import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HakedisTuru, PersonelSatir } from "@/types/personel";
import { ayAraligi } from "@/lib/utils";
import { YeniPersonelDialog } from "../yeni-personel-dialog";
import { PersonelListesi, type PersonelBordroOzet } from "../personel-listesi";

export default async function PersonelListesiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
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

  const yonetici = kullanici?.rol === "klinik_admin";
  const ay = ayAraligi(ayParam);

  const { data: personelSonucu, error } = await supabase
    .from("personel")
    .select("id, ad_soyad, gorev, maas, aktif, kullanici:kullanici_id(telefon)")
    .order("ad_soyad")
    .returns<PersonelSatir[]>();

  const personelListesi = personelSonucu ?? [];

  let bordroOzet: Record<string, PersonelBordroOzet> | undefined;

  if (yonetici) {
    const { data: hakedisSonucu } = await supabase
      .from("personel_ekstra_hakedis")
      .select("personel_id, tur, tutar")
      .gte("tarih", ay.baslangicTarih)
      .lt("tarih", ay.bitisTarih)
      .returns<{ personel_id: string; tur: HakedisTuru; tutar: number }[]>();

    bordroOzet = {};
    for (const h of hakedisSonucu ?? []) {
      const mevcut = bordroOzet[h.personel_id] ?? { fazlaMesai: 0, yolYemek: 0, sgk: 0 };
      if (h.tur === "mesai") mevcut.fazlaMesai += h.tutar;
      else if (h.tur === "yol" || h.tur === "yemek") mevcut.yolYemek += h.tutar;
      else if (h.tur === "sgk") mevcut.sgk += h.tutar;
      bordroOzet[h.personel_id] = mevcut;
    }
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Personel Listesi</h1>
            <p className="text-sm text-muted-foreground">
              Çalışanlar; terapistler için performans ve maaş hesaplama.
            </p>
          </div>
          {yonetici && (
            <div className="shrink-0">
              <YeniPersonelDialog />
            </div>
          )}
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Çalışanlar{yonetici && ` — Bordro (${ay.etiket})`}</CardTitle>
            {yonetici && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/panel/personel/liste?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
                />
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/panel/personel/liste?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}
            {!error && personelListesi.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz personel kaydı yok.</p>
            )}
            {!error && personelListesi.length > 0 && (
              <PersonelListesi personelListesi={personelListesi} yonetici={yonetici} bordroOzet={bordroOzet} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
