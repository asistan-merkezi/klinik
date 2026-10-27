// Server action / route / sayfa düzeyinde yetki kapıları (YENİ kimlik katmanı). Eski `eylemYetkisiGetir` (Supabase istemcisi döndürür) taşınmamış
// modüller için `eylem-yetkisi.ts`te KALIR; son modülde silinir.
import { redirect } from "next/navigation";
import { tenantGerekli, OturumHatasi, type OturumBaglami, type OturumRolu } from "./oturum";
import { oturumBaglami } from "./gecerli-kullanici";
import type { TenantBaglami } from "@/lib/db";

export const YETKISIZ_MESAJI = "Bu işlem için yetkiniz yok.";
export type PersonelRolu = Exclude<OturumRolu, "hasta">;

export type EylemYetkisi = {
  ctx: OturumBaglami;
  /** İzinli roller listesinde (veya super_admin) mi? Değilse çağıran YAZMADAN dönmeli (RLS yetkisiz UPDATE'i 0 satırla "başarılı" gösterirdi). */
  yetkili: boolean;
  /** Kullanıcının kliniği; super_admin'de null. */
  klinikId: string | null;
  /** withTenant için damgalı bağlam; klinik bağlamı yoksa (super_admin) null. */
  bag: TenantBaglami | null;
};

/**
 * Server action rol kapısı. Oturum yoksa /giris'e yönlenir; hasta oturumu personel eylemlerine giremez (yetkili=false).
 * RLS'e güvenmeden KODDA da rol kontrolü yapar (savunma derinliği); tenant ve rol oturumdan/DB'den gelir, istemciden değil.
 */
export async function eylemYetkisi(izinliRoller: readonly PersonelRolu[]): Promise<EylemYetkisi> {
  const ctx = await oturumBaglami();
  if (!ctx) redirect("/giris");
  const personelMi = ctx.tur === "personel";
  const yetkili = personelMi && (ctx.rol === "super_admin" || (izinliRoller as readonly string[]).includes(ctx.rol));
  return { ctx, yetkili, klinikId: ctx.tenantId, bag: ctx.tenantId ? tenantGerekli(ctx) : null };
}

/** Sayfa kapısı için oturum + tenant bağlamı: oturum yoksa /giris; klinik bağlamı yoksa 403 fırlatır. */
export async function panelBaglami(): Promise<{ ctx: OturumBaglami; bag: TenantBaglami }> {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") redirect("/giris");
  if (!ctx.tenantId) throw new OturumHatasi(403, "Bu sayfa bir klinik bağlamı gerektirir.");
  return { ctx, bag: tenantGerekli(ctx) };
}
