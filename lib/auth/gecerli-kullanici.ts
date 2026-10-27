import { cache } from "react";
import { headers } from "next/headers";
import { getSessionContext, type OturumBaglami } from "./oturum";

type KullaniciSatiri = {
  id: string;
  klinik_id: string | null;
  ad_soyad: string | null;
  rol: "super_admin" | "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe" | null;
};

export type GecerliKullanici = {
  authUser: { id: string; email: string | null };
  kullanici: KullaniciSatiri | null;
};

/**
 * İstek başına TEK oturum bağlamı (React cache()): oturum -> kimlik -> kullanici satırı (lib/auth/oturum.ts). Tenant ve rol ASLA istemciden gelmez.
 * Sayfalar, eylemler ve layout aynı istekte birden çok kez çağırsa da veritabanına bir kez gidilir.
 */
export const oturumBaglami = cache(async (): Promise<OturumBaglami | null> => getSessionContext(await headers()));

/**
 * Panel (personel) tarafı için eski dönüş şeklini korur: { authUser, kullanici }. Hasta oturumu panel kullanıcısı DEĞİLDİR (null).
 * Yeni kod doğrudan `oturumBaglami()` ve `lib/auth/yetki.ts` kullanır.
 */
export const gecerliKullanici = cache(async (): Promise<GecerliKullanici | null> => {
  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel") return null;
  return {
    authUser: { id: ctx.userId, email: ctx.eposta },
    kullanici: { id: ctx.userId, klinik_id: ctx.tenantId, ad_soyad: ctx.adSoyad, rol: ctx.rol === "hasta" ? null : ctx.rol },
  };
});
