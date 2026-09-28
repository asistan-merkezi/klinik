import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/datetime";
import { faturaEksikAlanlariBul, FATURA_ALAN_ETIKETLERI, type FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { kdvAyristir } from "@/lib/fatura/kdv-hesapla";
import { FaturaKesFormu } from "./fatura-kes-formu";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

type BorcDetaySatiri = {
  id: string;
  hasta_id: string;
  tutar: number;
  iskonto_tutari: number;
  aciklama: string | null;
  created_at: string;
  hasta: {
    ad_soyad: string;
    eposta: string | null;
    hasta_hassas: { kimlik_no: string | null; adres: string | null } | null;
  } | null;
  randevu: {
    islem_tanimi: { ad: string; muhasebe_hizmet_ismi: string | null; kdv_orani: number } | null;
  } | null;
};

export default async function FaturaDetaySayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  // 20260927160000) — burası sadece Fatura Kes butonunu göstermeye karar verir.
  const duzenlenebilir =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon" || kullanici?.rol === "muhasebe";

  const { data: hareket } = await supabase
    .from("hasta_bakiye_hareket")
    .select(
      "id, hasta_id, tutar, iskonto_tutari, aciklama, created_at, " +
        "hasta(ad_soyad, eposta, hasta_hassas(kimlik_no, adres)), " +
        "randevu(islem_tanimi(ad, muhasebe_hizmet_ismi, kdv_orani))"
    )
    .eq("id", id)
    .eq("tur", "borc")
    .maybeSingle<BorcDetaySatiri>();

  if (!hareket) {
    notFound();
  }

  const hassas = hareket.hasta?.hasta_hassas ?? null;

  const faturaBilgisi: FaturaBilgisiKontrol = {
    adSoyad: hareket.hasta?.ad_soyad ?? null,
    eposta: hareket.hasta?.eposta ?? null,
    adres: hassas?.adres ?? null,
    kimlikNo: hassas?.kimlik_no ?? null,
  };
  const eksikAlanlar = faturaEksikAlanlariBul(faturaBilgisi);

  const islemAdi =
    hareket.randevu?.islem_tanimi?.muhasebe_hizmet_ismi ?? hareket.randevu?.islem_tanimi?.ad ?? hareket.aciklama ?? "Borç";
  const toplamTutar = Math.max(hareket.tutar - hareket.iskonto_tutari, 0);
  const kdvOrani = hareket.randevu?.islem_tanimi?.kdv_orani ?? 0;
  const { matrah, kdvTutari } = kdvAyristir(toplamTutar, kdvOrani);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader
          title="Fatura Bilgisi"
          icon={Receipt}
          breadcrumb={
            <Link href="/panel/finans/gelirler-takibi/faturalar" className="inline-flex items-center gap-1 hover:text-foreground">
              <ChevronLeft className="size-4" aria-hidden />
              Kesilen Faturalar&apos;a dön
            </Link>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
              <FaturaBilgiSatiri etiket="Tarih" deger={formatDate(hareket.created_at)} />
              <FaturaBilgiSatiri etiket="Hasta" deger={hareket.hasta?.ad_soyad ?? "—"} />
              <FaturaBilgiSatiri etiket="TC Kimlik No" deger={hassas?.kimlik_no || "—"} />
              <FaturaBilgiSatiri etiket="Adres" deger={hassas?.adres || "—"} />
              <FaturaBilgiSatiri etiket="Açıklama" deger={islemAdi} />
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tutar</span>
                <span className="tabular-nums">{paraFormat(matrah)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">KDV{kdvOrani > 0 ? ` (%${kdvOrani})` : ""}</span>
                <span className="tabular-nums">{paraFormat(kdvTutari)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
                <span>Toplam Tutar</span>
                <span className="tabular-nums">{paraFormat(toplamTutar)}</span>
              </div>
            </div>

            {eksikAlanlar.length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                Fatura için eksik bilgi: {eksikAlanlar.map((a) => FATURA_ALAN_ETIKETLERI[a]).join(", ")}. Hastanın
                Kişisel Bilgiler sekmesinden tamamlayın.
              </p>
            )}

            {duzenlenebilir ? (
              <FaturaKesFormu hareketId={hareket.id} mevcutIskonto={hareket.iskonto_tutari} devreDisi={eksikAlanlar.length > 0} />
            ) : (
              <Link href="/panel/finans/gelirler-takibi/faturalar" className={buttonVariants({ variant: "outline", className: "w-fit" })}>
                Vazgeç
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FaturaBilgiSatiri({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{etiket}</span>
      <span className="font-medium text-foreground">{deger}</span>
    </div>
  );
}
