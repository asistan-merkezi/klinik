import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { HastaOzet } from "@/types/hasta-detay";
import { SekmeKartlari } from "./sekme-kartlari";
import { SEKMELER } from "./sekme-tanimlari";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "./hasta-getir";

export default async function HastaDetaySayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaTemelGetir(id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  const terapistMi = rol === "terapist";

  const supabase = await createClient();
  const { data: ozet } = await supabase
    .from("v_hasta_ozet")
    .select("*")
    .eq("hasta_id", id)
    .maybeSingle<HastaOzet>();

  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  return <SekmeKartlari hasta={hasta} ozet={ozet ?? null} gorunurSekmeler={gorunurSekmeler} />;
}
