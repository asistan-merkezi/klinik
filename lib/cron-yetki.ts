import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron, CRON_SECRET ayarlıysa `Authorization: Bearer <secret>` gönderir.
 * Secret tanımsızsa her istek reddedilir (cron'lar dışarıdan tetiklenip kredi
 * tüketmesin / dönem kapatmasın). Karşılaştırma sabit zamanlı.
 */
export function cronYetkiliMi(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const gelen = Buffer.from(request.headers.get("authorization") ?? "");
  const beklenen = Buffer.from(`Bearer ${secret}`);
  return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
}
