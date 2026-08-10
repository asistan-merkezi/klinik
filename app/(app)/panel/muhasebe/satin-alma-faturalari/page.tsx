import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
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
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Paraşüt Entegrasyonu</h1>
            <p className="text-sm text-muted-foreground">
              Satın alma faturaları ve stok fiyat senkronizasyonu.
            </p>
          </div>
          <EntegrasyonButonlari />
        </header>

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

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Fatura No</th>
                <th className="px-3 py-2 text-left font-medium">Tedarikçi</th>
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-right font-medium">Net Toplam</th>
                <th className="px-3 py-2 text-right font-medium">KDV</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Fatura bulunamadı. Arşivi güncellemek için &quot;Arşivi Güncelle&quot; butonuna basın.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
