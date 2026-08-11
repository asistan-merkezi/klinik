import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";
import type { FaturaDurumu } from "@/types/odeme";
import { FaturaDurumHucresi } from "./fatura-satiri";

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
        <header>
          <h1 className="text-xl font-semibold">Kesilen Faturalar</h1>
          <p className="text-sm text-muted-foreground">
            Faturalı işaretlenen ödemelerin ve borç kapatmaların toplu görünümü.
          </p>
        </header>

        {faturalar.length === 0 ? (
          <EmptyState icon={Receipt} title="Henüz fatura kaydı yok." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Tarih</th>
                  <th className="px-3 py-2 text-left font-medium">Hasta</th>
                  <th className="px-3 py-2 text-left font-medium">Açıklama</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="px-3 py-2 text-left font-medium">Durum</th>
                </tr>
              </thead>
              <tbody>
                {faturalar.map((f) => {
                  const toplam = (f.odeme?.odeme_satiri ?? []).reduce((acc, s) => acc + s.tutar, 0);
                  return (
                    <tr key={f.id} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(f.created_at).toLocaleString("tr-TR")}
                      </td>
                      <td className="px-3 py-2 font-medium">{f.odeme?.hasta?.ad_soyad ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.odeme?.aciklama || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{paraFormat(toplam)}</td>
                      <td className="px-3 py-2">
                        <FaturaDurumHucresi
                          faturaId={f.id}
                          durum={f.durum}
                          hataMesaji={f.hata_mesaji}
                          eArsivPdfUrl={f.e_arsiv_pdf_url}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
