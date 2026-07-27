import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { RandevuSatir } from "@/types/randevu";
import { gunAraligi } from "@/lib/utils";
import { TabletEkrani } from "./tablet-ekrani";

export default async function TabletOdaSayfasi({
  params,
}: {
  params: Promise<{ odaId: string }>;
}) {
  const { odaId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: oda } = await supabase.from("oda").select("id, ad").eq("id", odaId).single();

  if (!oda) {
    notFound();
  }

  const { baslangic, bitis } = gunAraligi();
  const { data: randevular } = await supabase
    .from("randevu")
    .select(
      "id, baslangic, bitis, durum, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
    )
    .eq("oda_id", odaId)
    .gte("baslangic", baslangic)
    .lt("baslangic", bitis)
    .order("baslangic")
    .returns<RandevuSatir[]>();

  return (
    <div className="dark flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border p-4">
        <h1 className="text-lg font-semibold">{oda.ad}</h1>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/panel/tablet">Oda değiştir</Link>}
        />
      </header>
      <TabletEkrani odaId={odaId} baslangicRandevular={randevular ?? []} />
    </div>
  );
}
