import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RandevuSatir } from "@/types/randevu";
import type { Klinik } from "@/types/klinik";
import { gunAraligi } from "@/lib/utils";
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
    .select("ad, logo_url, logo_url_koyu, marka_renkleri")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle<Klinik>();

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
    <TabletEkrani
      odaId={odaId}
      odaAdi={oda.ad}
      klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
      baslangicRandevular={randevular ?? []}
      ayarlar={tabletAyarlari}
    />
  );
}
