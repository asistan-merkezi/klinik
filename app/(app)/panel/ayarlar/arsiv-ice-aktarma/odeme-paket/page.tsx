import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { OdemePaketSihirbazi } from "./sihirbaz";

export default async function OdemePaketArsivIceAktarmaSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar/arsiv-ice-aktarma");
  }

  const { data: paketler } = await supabase.from("paket").select("id, ad").eq("aktif", true).order("ad");

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          icon={Wallet}
          title="Ödeme & Paket Geçmişi"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Hastalar bölümü tamamlandıktan sonra kullanın. Bu içe aktarma bir tahsilat işlemi DEĞİLDİR — Paraşüt fatura kuyruğunu tetiklemez, doğrudan geçmiş kayıt olarak eklenir."
        />

        <Card>
          <CardHeader>
            <CardTitle>Ödeme &amp; Paket İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <OdemePaketSihirbazi paketler={paketler ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
