import { redirect } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import type { IzinBakiye, IzinTalebi } from "@/types/izin";
import { BakiyeKarti } from "./bakiye-karti";
import { TalepFormu } from "./talep-formu";
import { TalepListesi } from "./talep-listesi";

export default async function IzinlerimSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: personel } = await supabase.from("personel").select("id, ad_soyad").eq("kullanici_id", user.id).maybeSingle();

  if (!personel) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <EmptyState icon={CalendarOff} title="Bu hesaba bağlı bir personel kaydı bulunamadı." />
        </div>
      </div>
    );
  }

  const [{ data: bakiye }, { data: talepler }] = await Promise.all([
    supabase.from("v_personel_izin_bakiye").select("*").eq("personel_id", personel.id).maybeSingle<IzinBakiye>(),
    supabase
      .from("personel_izin_talebi")
      .select(
        "id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url, durum, red_gerekce, degerlendiren_kullanici_id, degerlendirme_tarihi, iptal_eden_kullanici_id, iptal_tarihi, created_at"
      )
      .eq("personel_id", personel.id)
      .order("created_at", { ascending: false })
      .returns<IzinTalebi[]>(),
  ]);

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-24 sm:p-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">İznim</h1>
          <p className="text-sm text-muted-foreground">İzin bakiyeniz, yeni talep ve geçmiş talepleriniz.</p>
        </header>

        {bakiye && <BakiyeKarti bakiye={bakiye} />}

        <TalepFormu />

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Taleplerim</h2>
          {!talepler || talepler.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Henüz izin talebiniz yok." compact />
          ) : (
            <TalepListesi talepler={talepler} />
          )}
        </div>
      </div>
    </div>
  );
}
