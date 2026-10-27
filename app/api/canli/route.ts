// Canlı olay akışı (SSE). Tenant YALNIZ oturumdan gelir; istemci yalnız izinli TABLO listesi (?t=) seçebilir.
// Olay yükünde veri yok ({t,i}); istemci olayı alınca veriyi normal yetkili yoldan (oturum + RLS) yeniden çeker.
import { getSessionContext } from "@/lib/auth/oturum";
import { canliTekil, sseYaniti, tabloListesiCoz } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (status: number, hata: string) => Response.json({ hata }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const ctx = await getSessionContext(request.headers);
  if (!ctx) return json(401, "Oturum bulunamadı.");
  // Panel olayları yalnız personele; klinik bağlamı olmayan oturum (super_admin) ve geçici şifreyle girmiş kullanıcı alamaz.
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) return json(403, "Bu akış için yetkiniz yok.");
  const tablolar = tabloListesiCoz(new URL(request.url).searchParams.get("t"));
  if (!tablolar) return json(400, "Geçersiz tablo listesi.");

  const { dagitici } = canliTekil();
  const yanit = sseYaniti({ dagitici, klinikId: ctx.tenantId, kullaniciId: ctx.userId, tablolar, signal: request.signal });
  if (!yanit) return json(429, "Çok fazla açık canlı bağlantı.");
  return yanit;
}
