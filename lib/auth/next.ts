// Next.js bağlayıcıları: istek başlıkları/cookie'ler -> lib/auth fonksiyonları. Yalnız server component, server action ve route handler'larda çağrılır.
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getSessionContext as bagiamOku, requireSessionContext, OturumHatasi, type OturumBaglami } from "./oturum";

const CIHAZ_CEREZI = "klinik_cihaz";

/** Oturumlu kullanıcının bağlamı (user_id, tenant_id, rol). Oturum yoksa null. Tenant id'si asla istemciden alınmaz. */
export async function getSessionContext(): Promise<OturumBaglami | null> {
  return bagiamOku(await headers());
}

/** Oturum yoksa 401 (OturumHatasi) fırlatır; route handler'da `yanitaCevir` ile Response'a çevrilir. */
export async function requireSession(): Promise<OturumBaglami> {
  return requireSessionContext(await headers());
}

export function yanitaCevir(e: unknown): Response | null {
  if (e instanceof OturumHatasi) return Response.json({ hata: e.message }, { status: e.status });
  return null;
}

/** Cihaz kimliği: tarayıcıda uzun ömürlü httpOnly cookie. Yoksa üretilir (yalnız server action/route handler'da cookie yazılabilir). */
export async function cihazKimligiAl(): Promise<string> {
  const jar = await cookies();
  const mevcut = jar.get(CIHAZ_CEREZI)?.value;
  if (mevcut && /^[0-9a-f-]{36}$/i.test(mevcut)) return mevcut;
  const yeni = randomUUID();
  jar.set(CIHAZ_CEREZI, yeni, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 24 * 60 * 60 });
  return yeni;
}
