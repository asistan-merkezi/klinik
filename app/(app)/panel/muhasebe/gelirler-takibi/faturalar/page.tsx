import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Receipt } from "lucide-react";
import type { FaturaDurumu } from "@/types/odeme";
import { FaturaDurumHucresi } from "./fatura-satiri";
import { formatDateTime } from "@/lib/datetime";

type FaturaListSatiri = {
  id: string;
  durum: FaturaDurumu;
  hata_mesaji: string | null;
  e_arsiv_pdf_url: string | null;
  created_at: string;
  odeme: {
    aciklama: string | null;
    hasta: { ad_soyad: string } | null;
    odeme_satiri: { tutar: number }[];
  } | null;
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function FaturalarSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  const yetkili =
    kullanici?.rol === "klinik_admin" ||
    kullanici?.rol === "resepsiyon" ||
    kullanici?.rol === "muhasebe" ||
    kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const { data } = await supabase
    .from("fatura")
    .select(
      "id, durum, hata_mesaji, e_arsiv_pdf_url, created_at, odeme(aciklama, hasta(ad_soyad), odeme_satiri(tutar))"
    )
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<FaturaListSatiri[]>();

  const faturalar = data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Kesilen Faturalar"
          description="Faturalı işaretlenen ödemelerin ve borç kapatmaların toplu görünümü."
          icon={Receipt}
        />

        {faturalar.length === 0 ? (
          <EmptyState icon={Receipt} title="Henüz fatura kaydı yok." />
        ) : (
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarih</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faturalar.map((f) => {
                const toplam = (f.odeme?.odeme_satiri ?? []).reduce((acc, s) => acc + s.tutar, 0);
                return (
                  <TableRow key={f.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(f.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{f.odeme?.hasta?.ad_soyad ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{f.odeme?.aciklama || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{paraFormat(toplam)}</TableCell>
                    <TableCell>
                      <FaturaDurumHucresi
                        faturaId={f.id}
                        durum={f.durum}
                        hataMesaji={f.hata_mesaji}
                        eArsivPdfUrl={f.e_arsiv_pdf_url}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
