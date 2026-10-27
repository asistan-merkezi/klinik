import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { VARSAYILAN_TABLET_AYARLARI, type TabletAyarlari } from "@/types/tablet-ayarlari";
import { TabletAyarlariIstemci } from "./tablet-ayarlari-istemci";

export default async function TabletAyarlarSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const duzenlenebilir = ctx.rol === "klinik_admin";

  const v = await withTenant(bag, async (tx) => ({
    ayarlar: (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, bag.tenantId)).limit(1))[0]?.ayarlar,
    klinik: (await tx.select({ ad: sema.klinik.ad, logo_url: sema.klinik.logoUrl, logo_url_koyu: sema.klinik.logoUrlKoyu, marka_renkleri: sema.klinik.markaRenkleri }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0],
  }));
  const klinik = v.klinik as { ad: string; logo_url: string | null; logo_url_koyu: string | null; marka_renkleri: { primary?: string } | null } | undefined;
  const ayarlar: TabletAyarlari = {
    ...VARSAYILAN_TABLET_AYARLARI,
    ...(v.ayarlar as { tablet?: Partial<TabletAyarlari> } | null | undefined)?.tablet,
  };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Tablet Görünümü</h1>
          <p className="text-sm text-muted-foreground">
            Oda tabletlerinde hangi bilgilerin gösterileceğini seç. Değişiklikler tüm oda
            tabletlerine anında yansır.
          </p>
        </header>

        {duzenlenebilir ? (
          <TabletAyarlariIstemci
            ayarlar={ayarlar}
            klinik={klinik ?? { ad: "Klinik", logo_url: null, logo_url_koyu: null, marka_renkleri: null }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu ayarları yalnızca klinik yöneticisi düzenleyebilir.
          </p>
        )}
      </div>
    </div>
  );
}
