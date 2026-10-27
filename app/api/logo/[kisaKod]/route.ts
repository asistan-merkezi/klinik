import { headers } from "next/headers";
import { anonimUcCalistir } from "@/lib/guvenlik/anonim-uc";
import { logoBul, logoYaniti } from "@/lib/dosya/logo";

// Giriş öncesi logo (docs/sunucu-kurulum.md §3b2): tek amaçlı, önbellekli, tenant verisi dönmeyen route. Kısa kod -> tanima -> yalnız logo baytı.
// Bilinmeyen kod ile kodun logosu yok durumu AYNI yanıtı verir (404), kodun geçerliliği sızdırılmaz. Hız sınırı fail-closed (anonim uç).
export async function GET(_istek: Request, { params }: { params: Promise<{ kisaKod: string }> }) {
  const { kisaKod } = await params;
  const sonuc = await anonimUcCalistir({ ucAdi: "logo", kisaKod, basliklar: await headers(), ipLimiti: 120 }, async (_tx, klinik) => klinik.id);
  if (!sonuc.ok) return new Response(sonuc.kod === "hiz" ? "Çok fazla istek." : "Bulunamadı.", { status: sonuc.kod === "hiz" ? 429 : sonuc.kod === "kullanilamiyor" ? 503 : 404 });
  const logo = await logoBul(sonuc.sonuc);
  if (!logo) return new Response("Bulunamadı.", { status: 404 });
  return logoYaniti(logo, "public, max-age=3600");
}
