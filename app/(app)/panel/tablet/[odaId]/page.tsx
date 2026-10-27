import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tabletRandevulariGetir } from "@/lib/randevu/sorgular";
import type { Klinik } from "@/types/klinik";
import { gunAraligi } from "@/lib/utils";
import { VARSAYILAN_TABLET_AYARLARI, type TabletAyarlari } from "@/types/tablet-ayarlari";
import { TabletEkrani } from "./tablet-ekrani";
import { TabletOfflineKaydi } from "./tablet-offline-kaydi";

export default async function TabletOdaSayfasi({
  params,
}: {
  params: Promise<{ odaId: string }>;
}) {
  const { odaId } = await params;
  const { bag } = await panelBaglami();
  if (!/^[0-9a-f-]{36}$/i.test(odaId)) notFound();

  const { baslangic, bitis } = gunAraligi();
  const v = await withTenant(bag, async (tx) => {
    const oda = (await tx.select({ id: sema.oda.id, ad: sema.oda.ad }).from(sema.oda).where(eq(sema.oda.id, odaId)).limit(1))[0];
    if (!oda) return null;
    return {
      oda,
      ayarlar: (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, bag.tenantId)).limit(1))[0]?.ayarlar,
      klinik: (await tx.select({ ad: sema.klinik.ad, logo_url: sema.klinik.logoUrl, logo_url_koyu: sema.klinik.logoUrlKoyu, marka_renkleri: sema.klinik.markaRenkleri }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0],
      // DAR şekil: tanı/not/finans alanları kiosk istemcisine hiç gitmez.
      randevular: await tabletRandevulariGetir(tx, { baslangic, bitis, odaId }),
    };
  });
  if (!v) notFound();

  const oda = v.oda;
  const tabletAyarlari: TabletAyarlari = {
    ...VARSAYILAN_TABLET_AYARLARI,
    ...(v.ayarlar as { tablet?: Partial<TabletAyarlari> } | null | undefined)?.tablet,
  };
  const klinik = v.klinik as Klinik | undefined;
  const randevular = v.randevular;

  return (
    <>
      <TabletOfflineKaydi />
      <TabletEkrani
        odaId={odaId}
        odaAdi={oda.ad}
        klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
        baslangicRandevular={randevular ?? []}
        ayarlar={tabletAyarlari}
      />
    </>
  );
}
