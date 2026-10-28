import Link from "next/link";
import { ListChecks } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuListSatir } from "@/types/islem-tanimi";
import { YeniIslemSablonuDialog } from "../yeni-islem-sablonu-dialog";
import { SablonListesi } from "./sablon-listesi";

export default async function IslemTanimlamalarSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  let pozisyonlar: SecenekSatir[] = [];
  let cihazlar: SecenekSatir[] = [];
  let sablonlar: IslemAdimiSablonuListSatir[] = [];
  let hata = false;
  try {
    const v = await withTenant(bag, async (tx) => ({
      pozisyon: await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad }).from(sema.pozisyonlar).where(eq(sema.pozisyonlar.aktif, true)).orderBy(asc(sema.pozisyonlar.sira)),
      cihaz: await tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad }).from(sema.cihaz).where(eq(sema.cihaz.aktif, true)).orderBy(asc(sema.cihaz.ad)),
      tumPozisyon: await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad }).from(sema.pozisyonlar),
      tumCihaz: await tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad }).from(sema.cihaz),
      sablon: await tx.select().from(sema.islemAdimiSablonu).orderBy(asc(sema.islemAdimiSablonu.ad)),
    }));
    pozisyonlar = v.pozisyon;
    cihazlar = v.cihaz;
    const cihazAdi = new Map(v.tumCihaz.map((c) => [c.id, c.ad]));
    const pozisyonAdi = new Map(v.tumPozisyon.map((p) => [p.id, p.ad]));
    sablonlar = v.sablon.map((x) => ({
      id: x.id,
      ad: x.ad,
      uygulayici_pozisyon_id: x.uygulayiciPozisyonId,
      gerekli_cihaz_id: x.gerekliCihazId,
      sure_dakika: x.sureDakika,
      aktif: x.aktif,
      pozisyon: x.uygulayiciPozisyonId ? { ad: pozisyonAdi.get(x.uygulayiciPozisyonId) ?? "—" } : null,
      cihaz: x.gerekliCihazId ? { ad: cihazAdi.get(x.gerekliCihazId) ?? "—" } : null,
    }));
  } catch (e) {
    console.error("İşlem tanımları çekilemedi:", e);
    hata = true;
  }
  const sablonSonucu = { error: hata };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="İşlem Tanımlama"
          breadcrumb={
            <Link href="/panel/islemler" className="hover:underline">
              ‹ Tedavi Tanımları
            </Link>
          }
          description="Tedavi adımlarında yeniden kullanılabilir işlem kataloğu — ad, uygulayacak kişi ve süre."
          icon={ListChecks}
          actions={duzenlenebilir && <YeniIslemSablonuDialog pozisyonlar={pozisyonlar} cihazlar={cihazlar} />}
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı İşlem Tanımları</CardTitle>
          </CardHeader>
          <CardContent>
            {sablonSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!sablonSonucu.error && sablonlar.length === 0 && (
              <EmptyState icon={ListChecks} title="Henüz işlem tanımı yok." compact />
            )}
            {!sablonSonucu.error && sablonlar.length > 0 && (
              <SablonListesi
                sablonlar={sablonlar}
                pozisyonlar={pozisyonlar}
                cihazlar={cihazlar}
                duzenlenebilir={duzenlenebilir}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
