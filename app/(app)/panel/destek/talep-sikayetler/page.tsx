import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DestekTalebi } from "@/types/destek";
import { TalepFormu } from "./talep-formu";
import { TalepListesi } from "./talep-listesi";
import { AdminTalepListesi } from "./admin-talep-listesi";

export default async function TalepSikayetlerSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  const { data: kendiTalepler } = await supabase
    .from("destek_talebi")
    .select("id, klinik_id, kullanici_id, tur, konu, aciklama, durum, created_at, guncellenme_tarihi")
    .eq("kullanici_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DestekTalebi[]>();

  const klinikGeneliAdmin = kullanici?.rol === "klinik_admin";
  const { data: klinikTalepleri } = klinikGeneliAdmin
    ? await supabase
        .from("destek_talebi")
        .select(
          "id, klinik_id, kullanici_id, tur, konu, aciklama, durum, created_at, guncellenme_tarihi, kullanici:kullanici_id(ad_soyad)"
        )
        .eq("klinik_id", kullanici!.klinik_id ?? "")
        .order("created_at", { ascending: false })
        .returns<DestekTalebi[]>()
    : { data: null };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Talep ve Şikayetler</h1>
          <p className="text-sm text-muted-foreground">
            Panel/yazılımla ilgili bir talep veya şikayetinizi buradan iletebilirsiniz.
          </p>
        </header>

        <TalepFormu />

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Gönderdiklerim</h2>
          <TalepListesi talepler={kendiTalepler ?? []} />
        </section>

        {klinikGeneliAdmin && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Klinik Geneli (Tümü)</h2>
            <AdminTalepListesi talepler={klinikTalepleri ?? []} />
          </section>
        )}
      </div>
    </div>
  );
}
