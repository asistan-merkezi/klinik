import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { HastaOzet } from "@/types/hasta-detay";
import { GeriLink } from "../geri-link";
import { TedaviAnamnezSekmesi } from "../sekmeler/tedavi-anamnez-sekmesi";
import { hastaDetayFullGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function TedaviAnamnezSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaDetayFullGetir(supabase, id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(supabase, user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";
  const terapistMi = rol === "terapist";

  const { data: ozet } = await supabase
    .from("v_hasta_ozet")
    .select("*")
    .eq("hasta_id", id)
    .maybeSingle<HastaOzet>();

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Tedavi & Anamnez" />
      <TedaviAnamnezSekmesi
        hasta={hasta}
        aktif
        duzenlenebilir={duzenlenebilir || terapistMi}
        sonVasSkoru={ozet?.son_vas_skoru ?? null}
        rol={rol}
      />
    </div>
  );
}
