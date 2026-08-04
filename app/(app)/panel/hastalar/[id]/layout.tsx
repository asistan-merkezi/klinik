import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { RiskBandi } from "./risk-bandi";
import { OzetKart } from "./ozet-kart";
import { hastaTemelGetir, kullaniciRolGetir } from "./hasta-getir";

export default async function HastaDetayLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";
  const terapistMi = rol === "terapist";

  const riskEklenebilir = duzenlenebilir || terapistMi;

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
          dogumTarihi={hasta.dogum_tarihi}
          cinsiyet={hasta.cinsiyet}
          riskBayraklariBos={hasta.risk_bayraklari.length === 0}
          eklenebilir={riskEklenebilir}
        />

        {children}
      </div>
    </div>
  );
}
