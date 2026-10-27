import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { hastaOzetGetir } from "@/lib/hasta/ozet-sorgular";
import { Button } from "@/components/ui/button";
import { RiskBandi } from "./risk-bandi";
import { OzetKart } from "./ozet-kart";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "./hasta-getir";

export default async function HastaDetayLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, hasta] = await Promise.all([getAuthUser(), hastaTemelGetir(id)]);

  if (!user) {
    redirect("/giris");
  }
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";
  const terapistMi = rol === "terapist";

  const riskEklenebilir = duzenlenebilir || terapistMi;
  const ctx = await oturumBaglami();
  const ozet = ctx ? await withTenant(tenantGerekli(ctx), (tx) => hastaOzetGetir(tx, id)) : null;

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-4xl sm:p-8">
        <div className="flex justify-end">
          <Button variant="outline" nativeButton={false} render={<Link href="/panel/hastalar">Hastalara dön</Link>} />
        </div>

        <RiskBandi hastaId={hasta.id} riskBayraklari={hasta.risk_bayraklari} eklenebilir={riskEklenebilir} />

        <OzetKart
          hastaId={hasta.id}
          adSoyad={hasta.ad_soyad}
          telefon={hasta.telefon}
          eposta={hasta.eposta}
          dogumTarihi={hasta.dogum_tarihi}
          kalanPaketHakki={ozet?.kalan_paket_hakki ?? null}
          mesajAtabilir={duzenlenebilir}
        />

        {children}
      </div>
    </div>
  );
}
