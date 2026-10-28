// Finans server action'ları için ortak kapı: oturum + rol (KODDA, RLS'e ek olarak) + tenant bağlamı. Tenant ve kullanıcı oturumdan gelir.
import { eylemYetkisi, type PersonelRolu } from "@/lib/auth/yetki";
import type { TenantBaglami } from "@/lib/db";

export type FinansOturumu = { bag: TenantBaglami; klinikId: string; kullaniciId: string; adSoyad: string | null; rol: PersonelRolu };

/** İzinli rollerden biri değilse (veya klinik bağlamı yoksa) null — çağıran YAZMADAN dönmelidir. */
export async function finansOturumu(roller: readonly PersonelRolu[]): Promise<FinansOturumu | null> {
  const y = await eylemYetkisi(roller);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol === "hasta") return null;
  return { bag: y.bag, klinikId: y.klinikId, kullaniciId: y.ctx.userId, adSoyad: y.ctx.adSoyad, rol: y.ctx.rol };
}
