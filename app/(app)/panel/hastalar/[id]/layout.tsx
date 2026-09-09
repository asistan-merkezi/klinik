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
  const user = await getAuthUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaTemelGetir(id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";
  const terapistMi = rol === "terapist";

  const riskEklenebilir = duzenlenebilir || terapistMi;

  // Dosya başlığındaki "Aktif Paket" rozeti için — hub sayfası (page.tsx)
  // zaten aynı view'ı kendi ihtiyacı için ayrıca çekiyor; layout tüm alt
  // rotalarda (kişisel/randevu/tedavi/cari) render edildiği için burada da
  // ayrıca (tek satır, ucuz) çekiliyor — v_hasta_ozet view olduğundan embed
  // edilemiyor, zaten hasta-getir.ts'in kendi cache() düzeninin dışında.
  const supabase = await createClient();
  const { data: ozet } = await supabase
    .from("v_hasta_ozet")
    .select("kalan_paket_hakki")
    .eq("hasta_id", id)
    .maybeSingle();

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
