import { redirect } from "next/navigation";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { raporAyDonemi } from "@/lib/raporlar/donem";
import { EntegrasyonButonlari } from "./entegrasyon-butonlari";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function GelenFaturalarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string; ay?: string }>;
}) {
  const { yil: yilParam, ay: ayParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const klinikId = kullanici?.klinik_id ?? "";

  const { data: klinik } = await supabase
    .from("klinik")
    .select("created_at")
    .eq("id", klinikId)
    .maybeSingle<{ created_at: string }>();

  const simdi = new Date();
  const buYil = simdi.getFullYear();
  const buAy = simdi.getMonth() + 1;
  const klinikBaslangicYili = klinik?.created_at ? new Date(klinik.created_at).getFullYear() : buYil;

  const yil = Math.min(Math.max(parseInt(yilParam ?? "", 10) || buYil, klinikBaslangicYili), buYil);
  const ay = Math.min(Math.max(parseInt(ayParam ?? "", 10) || buAy, 1), 12);

  const oncekiAyTarih = new Date(Date.UTC(yil, ay - 2, 1));
  const sonrakiAyTarih = new Date(Date.UTC(yil, ay, 1));
  const oncekiAyGosterilebilir =
    oncekiAyTarih.getUTCFullYear() > klinikBaslangicYili ||
    oncekiAyTarih.getUTCFullYear() === klinikBaslangicYili;
  const sonrakiAyGosterilebilir =
    sonrakiAyTarih.getUTCFullYear() < buYil ||
    (sonrakiAyTarih.getUTCFullYear() === buYil && sonrakiAyTarih.getUTCMonth() + 1 <= buAy);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Gelen Faturalar"
          description="Satın alma faturaları ve stok fiyat senkronizasyonu (Paraşüt entegrasyonu)."
          icon={Receipt}
          actions={<EntegrasyonButonlari />}
        />

        <GiderlerSekmeCubugu />

        <div className="flex items-center justify-center gap-2 text-sm">
          {oncekiAyGosterilebilir ? (
            <Link
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
              href={`?yil=${oncekiAyTarih.getUTCFullYear()}&ay=${oncekiAyTarih.getUTCMonth() + 1}`}
            >
              ‹ Önceki
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
              ‹ Önceki
            </span>
          )}
          <span className="min-w-32 text-center font-medium">{raporAyDonemi(yil, ay).etiket}</span>
          {sonrakiAyGosterilebilir ? (
            <Link
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
              href={`?yil=${sonrakiAyTarih.getUTCFullYear()}&ay=${sonrakiAyTarih.getUTCMonth() + 1}`}
            >
              Sonraki ›
            </Link>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
              Sonraki ›
            </span>
          )}
        </div>

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
