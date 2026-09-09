import { redirect } from "next/navigation";
import Link from "next/link";
import { DatabaseBackup } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function YedeklemeSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={DatabaseBackup}
          title="Yedekleme"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Klinik verilerinin düzenli/manuel yedeğini almak için."
        />

        <Card>
          <CardHeader>
            <CardTitle>Henüz kurulmadı</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Yedekleme akışı (kapsam/sıklık) netleşince bu bölümden yönetilecek.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
