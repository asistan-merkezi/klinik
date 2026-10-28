import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ChevronLeft, Receipt } from "lucide-react";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { borcSatirlariniGetir } from "@/lib/fatura/sorgular";
import { netTutar, kurus } from "@/lib/para";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/datetime";
import { faturaEksikAlanlariBul, FATURA_ALAN_ETIKETLERI, type FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { kdvAyristir } from "@/lib/fatura/kdv-hesapla";
import { FaturaKesFormu } from "./fatura-kes-formu";
import { EksikBilgiDialog } from "./eksik-bilgi-dialog";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function FaturaDetaySayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansFatura);
  const { bag } = await panelBaglami();

  // Fatura kesme yetkisi RPC'de de ayrıca zorlanıyor (bkz. migration
  // 20260927160000) — burası sadece Fatura Kes butonunu göstermeye karar verir.
  const duzenlenebilir = (ROL_GRUPLARI.finansFatura as readonly string[]).includes(kullanici.rol);

  const hareket = z.string().uuid().safeParse(id).success ? (await withTenant(bag, (tx) => borcSatirlariniGetir(tx, { id })))[0] : undefined;

  if (!hareket) {
    notFound();
  }

  const hassas = hareket.hassas;

  const faturaBilgisi: FaturaBilgisiKontrol = {
    adSoyad: hareket.hasta?.ad_soyad ?? null,
    eposta: hareket.hasta?.eposta ?? null,
    adres: hassas?.adres ?? null,
    kimlikNo: hassas?.kimlik_no ?? null,
  };
  const eksikAlanlar = faturaEksikAlanlariBul(faturaBilgisi);

  // Kimlik/adres/e-posta yazma yetkisi muhasebe'de YOK (hasta_hassas RLS, bkz.
  // faturaHastaBilgisiTamamla) — muhasebe yalnız uyarıyı görür. Ad Soyad eksikse
  // diyalogda düzeltilecek alan olmadığı için buton gösterilmez.
  const hastaBilgisiDuzenlenebilir = ["klinik_admin", "resepsiyon", "super_admin"].includes(kullanici.rol);
  const tamamlanabilirEksikVar = eksikAlanlar.some((a) => ["eposta", "kimlik_no", "adres"].includes(a));

  const islemAdi =
    hareket.islem?.muhasebe_hizmet_ismi ?? hareket.islem?.ad ?? hareket.aciklama ?? "Borç";
  const toplamTutar = netTutar(kurus(hareket.tutar) ?? 0, kurus(hareket.iskonto_tutari) ?? 0) / 100;
  const kdvOrani = Number(hareket.islem?.kdv_orani ?? 0);
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
              <div className="flex flex-col gap-3">
                <p role="alert" className="text-sm text-destructive">
                  Fatura için eksik bilgi: {eksikAlanlar.map((a) => FATURA_ALAN_ETIKETLERI[a]).join(", ")}.
                  {hastaBilgisiDuzenlenebilir && tamamlanabilirEksikVar
                    ? ""
                    : " Hastanın bilgilerini tamamlaması için klinik yöneticisine/resepsiyona iletin."}
                </p>
                {hastaBilgisiDuzenlenebilir && tamamlanabilirEksikVar && hareket.hasta_id && (
                  <EksikBilgiDialog
                    hastaId={hareket.hasta_id}
                    eksikAlanlar={eksikAlanlar}
                    mevcutKimlikTipi={hassas?.kimlik_no_tipi ?? null}
                  />
                )}
              </div>
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
