import { cache } from "react";
import { oturumBaglami } from "./gecerli-kullanici";

export type GecerliHasta = { hastaId: string; authUserId: string; tenantId: string };

/**
 * Hasta Portalı sayfalarının ortak girişi: oturum + hasta_kullanici.aktif doğrulaması lib/auth/oturum.ts'te yapılır. Panel kullanıcısı (personel) için null.
 * cache() ile sarılı: aynı istekte tek sorgu.
 */
export const gecerliHasta = cache(async (): Promise<GecerliHasta | null> => {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "hasta" || !ctx.hastaId || !ctx.tenantId) return null;
  return { hastaId: ctx.hastaId, authUserId: ctx.userId, tenantId: ctx.tenantId };
});
