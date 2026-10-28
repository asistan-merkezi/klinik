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
  const { tenantId, userId } = ctx;
  // Her ping'de (25 sn) oturum baştaki başlıklarla YENİDEN çözülür: iptal edilmiş/süresi dolmuş/devre dışı oturum, farklı kullanıcı ya da klinik
  // bağlamı değişmişse (ör. destek bağlamı bitti) bağlantı kapanır. Çözümleme hatası da kapatır (fail-closed).
  const oturumGecerliMi = async () => {
    const g = await getSessionContext(request.headers);
    return !!g && g.tur === "personel" && g.userId === userId && g.tenantId === tenantId && !g.sifreDegistirmeli;
  };
  const yanit = sseYaniti({ dagitici, klinikId: tenantId, kullaniciId: userId, tablolar, signal: request.signal, oturumGecerliMi });
  if (!yanit) return json(429, "Çok fazla açık canlı bağlantı.");
  return yanit;
}
