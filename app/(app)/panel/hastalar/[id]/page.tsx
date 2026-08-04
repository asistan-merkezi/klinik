import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { HastaOzet } from "@/types/hasta-detay";
import { SekmeKartlari } from "./sekme-kartlari";
import { SEKMELER } from "./sekme-tanimlari";
import { hastaTemelGetir, kullaniciRolGetir } from "./hasta-getir";

export default async function HastaDetaySayfasi({
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

  const hasta = await hastaTemelGetir(supabase, id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(supabase, user.id);
  const terapistMi = rol === "terapist";

  const { data: ozet } = await supabase
    .from("v_hasta_ozet")
    .select("*")
    .eq("hasta_id", id)
    .maybeSingle<HastaOzet>();

  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  return <SekmeKartlari hasta={hasta} ozet={ozet ?? null} gorunurSekmeler={gorunurSekmeler} />;
}
