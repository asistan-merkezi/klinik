// Oturumdaki yöneticinin kliniği için resmi tatil uyarıları (sayfa yardımcısı; Puantaj Cetveli ve Resmi Tatiller sayfası kullanır).
import { withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { resmiTatilUyarilariGetir, type TatilUyarisi } from "./durum";

export async function tatilUyarilariniGetir(): Promise<TatilUyarisi[]> {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel" || !ctx.tenantId) return [];
  return withTenant(tenantGerekli(ctx), (tx) => resmiTatilUyarilariGetir(tx));
}
