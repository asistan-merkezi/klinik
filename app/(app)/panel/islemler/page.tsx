import Link from "next/link";
import { CirclePlus, Stethoscope } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl } from "@/lib/para";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuSatir, IslemTanimiSatir } from "@/types/islem-tanimi";
import { YeniTedaviDialog } from "./yeni-tedavi-dialog";
import { TedaviListesi } from "./tedavi-listesi";

export default async function IslemlerSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  let cihazlar: SecenekSatir[] = [];
  let pozisyonlar: SecenekSatir[] = [];
  let islemler: IslemTanimiSatir[] = [];
  let sablonlar: IslemAdimiSablonuSatir[] = [];
  let hata = false;
  try {
    const v = await withTenant(bag, async (tx) => {
      const cihaz = await tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad }).from(sema.cihaz).where(eq(sema.cihaz.aktif, true)).orderBy(asc(sema.cihaz.ad));
      const pozisyon = await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad }).from(sema.pozisyonlar).where(eq(sema.pozisyonlar.aktif, true)).orderBy(asc(sema.pozisyonlar.sira));
      // Adım satırlarındaki cihaz/pozisyon adı için pasifler de gerekir (eski adım pasif bir cihaza bağlı olabilir).
      const tumCihaz = await tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad }).from(sema.cihaz);
      const tumPozisyon = await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad }).from(sema.pozisyonlar);
      const islem = await tx.select().from(sema.islemTanimi).orderBy(asc(sema.islemTanimi.ad));
      const adim = await tx.select().from(sema.islemTanimiAdim).orderBy(asc(sema.islemTanimiAdim.sira));
      const sablon = await tx
        .select({ id: sema.islemAdimiSablonu.id, ad: sema.islemAdimiSablonu.ad, uygulayici_pozisyon_id: sema.islemAdimiSablonu.uygulayiciPozisyonId, gerekli_cihaz_id: sema.islemAdimiSablonu.gerekliCihazId, sure_dakika: sema.islemAdimiSablonu.sureDakika })
        .from(sema.islemAdimiSablonu)
        .where(eq(sema.islemAdimiSablonu.aktif, true))
        .orderBy(asc(sema.islemAdimiSablonu.ad));
      return { cihaz, pozisyon, tumCihaz, tumPozisyon, islem, adim, sablon };
    });
    cihazlar = v.cihaz;
    pozisyonlar = v.pozisyon;
    sablonlar = v.sablon;
    const cihazAdi = new Map(v.tumCihaz.map((c) => [c.id, c.ad]));
    const pozisyonAdi = new Map(v.tumPozisyon.map((p) => [p.id, p.ad]));
    islemler = v.islem.map((i) => ({
      id: i.id,
      ad: i.ad,
      vita_fiyat: tl(i.vitaFiyat),
      plus_fiyat: i.plusFiyat === null ? null : tl(i.plusFiyat),
      elit_fiyat: i.elitFiyat === null ? null : tl(i.elitFiyat),
      prime_fiyat: i.primeFiyat === null ? null : tl(i.primeFiyat),
      kdv_orani: Number(i.kdvOrani),
      muhasebe_hizmet_ismi: i.muhasebeHizmetIsmi,
      sure_dakika: i.sureDakika,
      aktif: i.aktif,
      adimlar: v.adim
        .filter((a) => a.islemTanimiId === i.id)
        .map((a) => ({
          id: a.id,
          ad: a.ad,
          sure_dakika: a.sureDakika,
          gerekli_cihaz_id: a.gerekliCihazId,
          cihaz: a.gerekliCihazId ? { ad: cihazAdi.get(a.gerekliCihazId) ?? "—" } : null,
          uygulayici_pozisyon_id: a.uygulayiciPozisyonId,
          pozisyon: a.uygulayiciPozisyonId ? { ad: pozisyonAdi.get(a.uygulayiciPozisyonId) ?? "—" } : null,
        })),
    }));
  } catch (e) {
    console.error("Tedavi tanımları çekilemedi:", e);
    hata = true;
  }
  const islemSonucu = { error: hata };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Tedavi Tanımları"
          description="Fiyat kataloğunu görüntüle ve yönet."
          icon={Stethoscope}
          actions={
            duzenlenebilir && (
              <div className="flex flex-col items-end gap-2">
                <YeniTedaviDialog cihazlar={cihazlar} pozisyonlar={pozisyonlar} sablonlar={sablonlar} />
                <Button
                  variant="clinical"
                  nativeButton={false}
                  render={
                    <Link href="/panel/islemler/tanimlamalar">
                      <CirclePlus /> İşlem Tanımlama
                    </Link>
                  }
                />
              </div>
            )
          }
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı Tedaviler</CardTitle>
          </CardHeader>
          <CardContent>
            {islemSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!islemSonucu.error && islemler.length === 0 && (
              <EmptyState icon={Stethoscope} title="Henüz tedavi tanımı yok." compact />
            )}
            {!islemSonucu.error && islemler.length > 0 && (
              <TedaviListesi
                islemler={islemler}
                cihazlar={cihazlar}
                pozisyonlar={pozisyonlar}
                sablonlar={sablonlar}
                duzenlenebilir={duzenlenebilir}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
