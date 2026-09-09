import { redirect } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HastalarSihirbazi } from "./sihirbaz";

export default async function HastalarArsivIceAktarmaSayfasi() {
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

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Users}
          title="Hastalar"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Eski programdaki hasta kayıtlarını Excel/CSV dosyasından toplu olarak aktarın. Bu adım, randevu ve ödeme/paket geçmişini aktarmadan önce tamamlanmalı."
        />

        <Card>
          <CardHeader>
            <CardTitle>Hasta İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <HastalarSihirbazi />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
