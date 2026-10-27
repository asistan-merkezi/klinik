import { cache } from "react";
import { oturumBaglami } from "./gecerli-kullanici";
import { tenantGerekli } from "./oturum";
import type { TenantBaglami } from "@/lib/db";

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

/** Portal eylemleri/sayfaları için: hastaId + tenant bağlamı (withTenant) OTURUMDAN; istemciden hiçbir kimlik alınmaz. Personel/oturumsuz için null. */
export const gecerliHastaBaglami = cache(async (): Promise<{ hastaId: string; userId: string; bag: TenantBaglami } | null> => {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "hasta" || !ctx.hastaId || !ctx.tenantId) return null;
  return { hastaId: ctx.hastaId, userId: ctx.userId, bag: tenantGerekli(ctx) };
});
