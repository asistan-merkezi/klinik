import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HakedisTuru, MaasHesaplamaModeli } from "@/types/personel";
import { ayAraligi } from "@/lib/utils";
import { maasHesapla } from "@/lib/maas";
import { PersonelTakipListesi, type TakipSatiri } from "./takip-listesi";

type PersonelSatiri = { id: string; ad_soyad: string; gorev: string; maas: number | null; aktif: boolean };
type TerapistSatiri = {
  id: string;
  personel_id: string;
  maas_hesaplama_modeli: MaasHesaplamaModeli;
  prim_sabit_tutar: number | null;
  baraj_seans_sayisi: number | null;
  baraj_bonus_tutari: number | null;
};

export default async function PersonelTakipSayfasi({
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

  if (kullanici?.rol !== "klinik_admin") {
    notFound();
  }

  const ay = ayAraligi(ayParam);

  const { data: personelSonucu } = await supabase
    .from("personel")
    .select("id, ad_soyad, gorev, maas, aktif")
    .order("ad_soyad")
    .returns<PersonelSatiri[]>();
  const personelListesi = personelSonucu ?? [];

  const { data: terapistSonucu } = await supabase
    .from("terapist")
    .select("id, personel_id, maas_hesaplama_modeli, prim_sabit_tutar, baraj_seans_sayisi, baraj_bonus_tutari")
    .returns<TerapistSatiri[]>();
  const terapistListesi = terapistSonucu ?? [];
  const terapistMap = new Map(terapistListesi.map((t) => [t.personel_id, t]));

  const seansSayisiGirdileri = await Promise.all(
    terapistListesi.map(async (t) => {
      const { count } = await supabase
        .from("randevu")
        .select("id", { count: "exact", head: true })
        .eq("terapist_id", t.id)
        .in("durum", ["geldi", "gecikmeli_geldi", "tamamlandi"])
        .gte("baslangic", ay.baslangic)
        .lt("baslangic", ay.bitis);
      return [t.personel_id, count ?? 0] as const;
    })
  );
  const seansSayisiMap = new Map(seansSayisiGirdileri);

  const { data: hakedisSonucu } = await supabase
    .from("personel_ekstra_hakedis")
    .select("personel_id, tur, tutar")
    .gte("tarih", ay.baslangicTarih)
    .lt("tarih", ay.bitisTarih)
    .returns<{ personel_id: string; tur: HakedisTuru; tutar: number }[]>();

  // Hakediş = personelin eline geçen tutar; SGK işveren tarafından devlete
  // yatırılan bir gider olduğu için (personelin "alacağı" değil) buraya dahil
  // edilmiyor — bkz. personel/liste sayfasındaki bordro maliyeti görünümü.
  const ekstraToplamMap = new Map<string, number>();
  for (const h of hakedisSonucu ?? []) {
    if (h.tur === "sgk") continue;
    ekstraToplamMap.set(h.personel_id, (ekstraToplamMap.get(h.personel_id) ?? 0) + h.tutar);
  }

  const { data: odemeSonucu } = await supabase
    .from("personel_odeme")
    .select("personel_id, tutar")
    .gte("tarih", ay.baslangicTarih)
    .lt("tarih", ay.bitisTarih)
    .returns<{ personel_id: string; tutar: number }[]>();

  const odenenMap = new Map<string, number>();
  for (const o of odemeSonucu ?? []) {
    odenenMap.set(o.personel_id, (odenenMap.get(o.personel_id) ?? 0) + o.tutar);
  }

  const satirlar: TakipSatiri[] = personelListesi.map((p) => {
    const terapist = terapistMap.get(p.id);
    const hesap = maasHesapla(
      {
        maas_hesaplama_modeli: terapist?.maas_hesaplama_modeli ?? "sabit",
        sabit_maas: p.maas,
        prim_sabit_tutar: terapist?.prim_sabit_tutar ?? null,
        baraj_seans_sayisi: terapist?.baraj_seans_sayisi ?? null,
        baraj_bonus_tutari: terapist?.baraj_bonus_tutari ?? null,
      },
      seansSayisiMap.get(p.id) ?? 0,
      ekstraToplamMap.get(p.id) ?? 0
    );

    return {
      id: p.id,
      ad_soyad: p.ad_soyad,
      gorev: p.gorev,
      aktif: p.aktif,
      hakedis: hesap.toplam,
      odenen: odenenMap.get(p.id) ?? 0,
    };
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Personel Maaş</h1>
          <p className="text-sm text-muted-foreground">
            Personelin klinikten alacağı — hesaplanan hakediş ile fiilen ödenen tutar arasındaki fark.
          </p>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Alacak Takibi — {ay.etiket}</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/panel/personel/takip?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
              />
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`/panel/personel/takip?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
              />
            </div>
          </CardHeader>
          <CardContent>
            {satirlar.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz personel kaydı yok.</p>
            ) : (
              <PersonelTakipListesi satirlar={satirlar} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
