import { notFound, redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { hastaOzetGetir } from "@/lib/hasta/ozet-sorgular";
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

  const ctx = await oturumBaglami();
  const ozet = ctx ? await withTenant(tenantGerekli(ctx), (tx) => hastaOzetGetir(tx, id)) : null;

  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  return <SekmeKartlari hasta={hasta} ozet={ozet} gorunurSekmeler={gorunurSekmeler} />;
}
