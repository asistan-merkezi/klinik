import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  // Üç sorgu birbirinden bağımsız (hiçbiri diğerinin sonucuna ihtiyaç
  // duymuyor) — Promise.all ile paralel. `rol` auth sonucuna bağlı olduğu
  // için ayrı kalıyor, ama kullaniciRolGetir zaten gecerliKullanici()'ye
  // delege ettiğinden (bkz. hasta-getir.ts) burada yeni bir round-trip AÇMAZ.
  const [user, hasta, ozetSonucu] = await Promise.all([
    getAuthUser(),
    hastaTemelGetir(id),
    supabase.from("v_hasta_ozet").select("kalan_paket_hakki").eq("hasta_id", id).maybeSingle(),
  ]);

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
  const ozet = ozetSonucu.data;

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
          cinsiyet={hasta.cinsiyet}
          kategori={hasta.kategori}
          kalanPaketHakki={ozet?.kalan_paket_hakki ?? null}
          riskBayraklariBos={hasta.risk_bayraklari.length === 0}
          eklenebilir={riskEklenebilir}
        />

        {children}
      </div>
    </div>
  );
}
