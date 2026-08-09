import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { RandevuSatir } from "@/types/randevu";
import { cn, gunAraligi } from "@/lib/utils";
import { VARSAYILAN_TABLET_AYARLARI, type TabletAyarlari } from "@/types/tablet-ayarlari";
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

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  const { data: klinikAyarlar } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const tabletAyarlari: TabletAyarlari = {
    ...VARSAYILAN_TABLET_AYARLARI,
    ...(klinikAyarlar?.ayarlar as { tablet?: Partial<TabletAyarlari> } | null)?.tablet,
  };

  const { data: klinik } = await supabase
    .from("klinik")
    .select("logo_url")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const { baslangic, bitis } = gunAraligi();
  const { data: randevular } = await supabase
    .from("randevu")
    .select(
      "id, baslangic, bitis, durum, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi(id, ad)"
    )
    .eq("oda_id", odaId)
    .gte("baslangic", baslangic)
    .lt("baslangic", bitis)
    .order("baslangic")
    .returns<RandevuSatir[]>();

  return (
    <div
      className={cn(
        tabletAyarlari.tema === "koyu" && "dark",
        "flex min-h-screen flex-col bg-background text-foreground"
      )}
    >
      <header className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-3">
          {klinik?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={klinik.logo_url} alt="" className="h-8 w-auto object-contain" />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Logo</span>
          )}
          <h1 className="text-lg font-semibold">{oda.ad}</h1>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Oda değiştir"
          nativeButton={false}
          render={
            <Link href="/panel/tablet">
              <Home />
            </Link>
          }
        />
      </header>
      <TabletEkrani
        odaId={odaId}
        baslangicRandevular={randevular ?? []}
        ayarlar={tabletAyarlari}
      />
    </div>
  );
}
