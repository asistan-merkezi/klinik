import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { DonemSecici } from "./donem-secici";
import { EntegrasyonButonlari } from "./entegrasyon-butonlari";

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function SatinAlmaFaturalariSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const simdi = new Date();

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Paraşüt Entegrasyonu"
          description="Satın alma faturaları ve stok fiyat senkronizasyonu."
          icon={Receipt}
          actions={<EntegrasyonButonlari />}
        />

        <DonemSecici buAy={simdi.getMonth() + 1} buYil={simdi.getFullYear()} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Toplam Fatura</p>
              <p className="text-2xl font-semibold">0 adet</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Net Toplam</p>
              <p className="text-2xl font-semibold">{paraFormat(0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">KDV</p>
              <p className="text-2xl font-semibold">{paraFormat(0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">Toplam Tutar</p>
              <p className="text-2xl font-semibold text-primary">{paraFormat(0)}</p>
            </CardContent>
          </Card>
        </div>

        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fatura No</TableHead>
              <TableHead>Tedarikçi</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead className="text-right">Net Toplam</TableHead>
              <TableHead className="text-right">KDV</TableHead>
              <TableHead>Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <td colSpan={6} className="px-4 py-10">
                <EmptyState
                  icon={Receipt}
                  title="Fatura bulunamadı."
                  description={'Arşivi güncellemek için "Arşivi Güncelle" butonuna basın.'}
                  className="border-none"
                />
              </td>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
