import { asc, eq } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import type { TedaviSecenekSatir } from "@/types/randevu";

/**
 * Randevu oluşturma ekranlarındaki Tedavi seçim listesi — her tedavinin
 * adımlarında tanımlı "uygulayıcı" pozisyon id'lerini de taşır, Personel
 * seçiciyi buna göre daraltmak için (bkz. randevu-formu.tsx). Hiçbir adımda
 * pozisyon tanımlı değilse pozisyon_idleri boş dizi döner = filtre uygulanmaz.
 */
export async function tedaviSecenekleriGetir(tx: Tx): Promise<TedaviSecenekSatir[]> {
  const tedaviler = await tx
    .select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad, sureDakika: sema.islemTanimi.sureDakika })
    .from(sema.islemTanimi)
    .where(eq(sema.islemTanimi.aktif, true))
    .orderBy(asc(sema.islemTanimi.ad));
  if (tedaviler.length === 0) return [];

  // FK embed yerine ayrı sorgu + Map (tedavi sayısı sınırlı; adım tablosu klinik başına küçük). Sıra: adım sırası.
  const adimlar = await tx
    .select({
      islemTanimiId: sema.islemTanimiAdim.islemTanimiId,
      ad: sema.islemTanimiAdim.ad,
      sira: sema.islemTanimiAdim.sira,
      sureDakika: sema.islemTanimiAdim.sureDakika,
      pozisyonId: sema.islemTanimiAdim.uygulayiciPozisyonId,
      cihazId: sema.islemTanimiAdim.gerekliCihazId,
      cihazAd: sema.cihaz.ad,
    })
    .from(sema.islemTanimiAdim)
    .leftJoin(sema.cihaz, eq(sema.cihaz.id, sema.islemTanimiAdim.gerekliCihazId))
    .orderBy(asc(sema.islemTanimiAdim.sira));

  const adimHaritasi = new Map<string, typeof adimlar>();
  for (const a of adimlar) adimHaritasi.set(a.islemTanimiId, [...(adimHaritasi.get(a.islemTanimiId) ?? []), a]);

  return tedaviler.map((t) => {
    const a = adimHaritasi.get(t.id) ?? [];
    return {
      id: t.id,
      ad: t.ad,
      sure_dakika: t.sureDakika,
      pozisyon_idleri: Array.from(new Set(a.map((x) => x.pozisyonId).filter((id): id is string => Boolean(id)))),
      adimlar: a.map((x) => ({ ad: x.ad, sure_dakika: x.sureDakika, cihaz_id: x.cihazId, cihaz_ad: x.cihazAd ?? null })),
    };
  });
}
