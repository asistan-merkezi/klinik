import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { logoBul, logoYaniti } from "@/lib/dosya/logo";

// Oturumlu panel/portal için KENDİ kliniğinin logosu. Klinik kimliği istemciden alınmaz: oturum bağlamından gelir.
export async function GET() {
  const ctx = await oturumBaglami();
  if (!ctx) return new Response("Yetkisiz.", { status: 401 });
  if (!ctx.tenantId) return new Response("Bulunamadı.", { status: 404 });
  const logo = await logoBul(ctx.tenantId);
  if (!logo) return new Response("Bulunamadı.", { status: 404 });
  return logoYaniti(logo, "private, max-age=3600");
}
