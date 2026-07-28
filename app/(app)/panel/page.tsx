import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";

export default async function PanelSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { baslangic, bitis } = gunAraligi();
  const [randevularSonucu, odaSonucu] = await Promise.all([
    supabase
      .from("randevu")
      .select(
        "id, baslangic, bitis, durum, oda_id, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad)"
      )
      .gte("baslangic", baslangic)
      .lt("baslangic", bitis)
      .order("baslangic")
      .returns<RandevuSatir[]>(),
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  const { data: randevular, error } = randevularSonucu;
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));

  if (error) {
    console.error("Bugünkü randevular çekilemedi:", error);
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {error ? (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        ) : (
          <CanliCizelge baslangicRandevular={randevular ?? []} odalar={odalar} />
        )}
      </div>
    </div>
  );
}
