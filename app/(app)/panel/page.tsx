import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RandevuSatir } from "@/types/randevu";
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
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {error ? (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        ) : (
          <CanliCizelge baslangicRandevular={randevular ?? []} />
        )}
      </div>
    </div>
  );
}
