import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Receipt } from "lucide-react";
import type { FaturaSatir } from "@/types/odeme";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { FinansBorcSatiriBileseni, type FinansBorcSatiri } from "./borc-satiri";

type BorcSorguSatiri = {
  id: string;
  hasta_id: string;
  tutar: number;
  iskonto_tutari: number;
  aciklama: string | null;
  created_at: string;
  hasta: { ad_soyad: string; eposta: string | null } | null;
  randevu: {
    terapist: { personel: { ad_soyad: string } | null } | null;
    islem_tanimi: { ad: string } | null;
  } | null;
  odeme: { fatura: FaturaSatir[] } | null;
};

type HastaHassasSatiri = { hasta_id: string; kimlik_no: string | null; adres: string | null };

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

  // Fatura kesme yetkisi RPC'de de ayrıca zorlanıyor (bkz. migration
  // 20260927160000) — burası sadece dialogu göstermeye karar veriyor.
  const duzenlenebilir =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon" || kullanici?.rol === "muhasebe";

  const { data } = await supabase
    .from("hasta_bakiye_hareket")
    .select(
      "id, hasta_id, tutar, iskonto_tutari, aciklama, created_at, " +
        "hasta(ad_soyad, eposta), " +
        "randevu(terapist(personel(ad_soyad)), islem_tanimi(ad)), " +
        "odeme(fatura(id, durum, hata_mesaji, e_arsiv_pdf_url))"
    )
    .eq("tur", "borc")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<BorcSorguSatiri[]>();

  const borclar = data ?? [];
  const hastaIdler = [...new Set(borclar.map((b) => b.hasta_id))];

  const { data: hassasData } = hastaIdler.length
    ? await supabase
        .from("hasta_hassas")
        .select("hasta_id, kimlik_no, adres")
        .in("hasta_id", hastaIdler)
        .returns<HastaHassasSatiri[]>()
    : { data: [] as HastaHassasSatiri[] };

  const hassasMap = new Map((hassasData ?? []).map((h) => [h.hasta_id, h]));

  const satirlar: FinansBorcSatiri[] = borclar.map((b) => {
    const hassas = hassasMap.get(b.hasta_id);
    const faturaBilgisi: FaturaBilgisiKontrol = {
      adSoyad: b.hasta?.ad_soyad ?? null,
      eposta: b.hasta?.eposta ?? null,
      adres: hassas?.adres ?? null,
      kimlikNo: hassas?.kimlik_no ?? null,
    };
    return {
      id: b.id,
      hastaAdSoyad: b.hasta?.ad_soyad ?? "—",
      islemAdi: b.randevu?.islem_tanimi?.ad ?? b.aciklama ?? "Borç",
      terapistAdi: b.randevu?.terapist?.personel?.ad_soyad ?? null,
      tutar: b.tutar,
      iskontoTutari: b.iskonto_tutari,
      createdAt: b.created_at,
      fatura: b.odeme?.fatura?.[0] ?? null,
      faturaBilgisi,
    };
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          title="Kesilen Faturalar"
          description="Tüm seans ve paket bedelleri burada listelenir. Fatura kesmek istediğiniz satıra tıklayın; dokunmadığınız satırlar faturasız kayıt olarak kalır."
          icon={Receipt}
        />

        {satirlar.length === 0 ? (
          <EmptyState icon={Receipt} title="Henüz borç kaydı yok." />
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarih</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead className="text-right">İskonto</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((satir) => (
                <FinansBorcSatiriBileseni key={satir.id} satir={satir} duzenlenebilir={duzenlenebilir} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
