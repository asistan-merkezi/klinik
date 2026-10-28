import { PackageOpen, Archive } from "lucide-react";
import { asc } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl } from "@/lib/para";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { SecenekSatir } from "@/types/randevu";
import type { PaketSatir } from "@/types/paket";
import { paketArsivdeMi } from "@/lib/paket/satis-suresi";
import { YeniPaketDialog } from "./yeni-paket-dialog";
import { PaketSatiri } from "./paket-satiri";

export default async function PaketlerSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";
  const satisYapabilir = ctx.rol === "klinik_admin" || ctx.rol === "resepsiyon";

  let islemTanimlari: SecenekSatir[] = [];
  let paketler: PaketSatir[] = [];
  let hata = false;
  try {
    const v = await withTenant(bag, async (tx) => ({
      islemler: await tx.select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad, aktif: sema.islemTanimi.aktif }).from(sema.islemTanimi).orderBy(asc(sema.islemTanimi.ad)),
      paketler: await tx.select().from(sema.paket).orderBy(asc(sema.paket.ad)),
    }));
    islemTanimlari = v.islemler.filter((i) => i.aktif).map((i) => ({ id: i.id, ad: i.ad }));
    const adlar = new Map(v.islemler.map((i) => [i.id, i.ad]));
    paketler = v.paketler.map((p) => ({
      id: p.id,
      ad: p.ad,
      seans_sayisi: p.seansSayisi,
      satis_bitis_tarihi: p.satisBitisTarihi,
      fiyat: tl(p.fiyat),
      kdv_orani: Number(p.kdvOrani),
      aktif: p.aktif,
      tekrar_sayisi: p.tekrarSayisi,
      kisi_kotasi: p.kisiKotasi,
      islem_tanimi: adlar.has(p.islemTanimiId) ? { ad: adlar.get(p.islemTanimiId)! } : null,
    }));
  } catch (e) {
    console.error("Paketler çekilemedi:", e);
    hata = true;
  }
  const paketSonucu = { error: hata };
  const guncelPaketler = paketler.filter((p) => !paketArsivdeMi(p));
  const arsivPaketler = paketler.filter((p) => paketArsivdeMi(p));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Paketler"
          description="Hastalara satılabilecek seans paketlerini yönet."
          icon={PackageOpen}
          actions={duzenlenebilir && <YeniPaketDialog islemTanimlari={islemTanimlari} />}
        />

        <Card>
          <CardHeader>
            <CardTitle>Güncel Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {paketSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!paketSonucu.error && guncelPaketler.length === 0 && (
              <EmptyState icon={PackageOpen} title="Henüz paket yok." compact />
            )}
            {!paketSonucu.error && guncelPaketler.length > 0 && (
              <ul className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3">
                {guncelPaketler.map((paket, i) => (
                  <PaketSatiri
                    key={paket.id}
                    paket={paket}
                    islemTanimlari={islemTanimlari}
                    duzenlenebilir={duzenlenebilir}
                    satisYapabilir={satisYapabilir}
                    gecikme={i * 40}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arşiv Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {!paketSonucu.error && arsivPaketler.length === 0 && (
              <EmptyState icon={Archive} title="Arşivde paket yok." compact />
            )}
            {!paketSonucu.error && arsivPaketler.length > 0 && (
              <ul className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3">
                {arsivPaketler.map((paket, i) => (
                  <PaketSatiri
                    key={paket.id}
                    paket={paket}
                    islemTanimlari={islemTanimlari}
                    duzenlenebilir={duzenlenebilir}
                    satisYapabilir={satisYapabilir}
                    gecikme={i * 40}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
