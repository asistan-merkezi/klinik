// Kaşe görseli — YALNIZ klinik yöneticisi, kendi kliniğinin personeli için. Ayrıntı: lib/dosya/personel-belge.ts.
import { getSessionContext, tenantGerekli } from "@/lib/auth/oturum";
import { belgeYaniti, kaseGorseliGetir } from "@/lib/dosya/personel-belge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (durum: number, hata: string) => Response.json({ hata }, { status: durum, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ personelId: string }> }) {
  const ctx = await getSessionContext(request.headers);
  if (!ctx) return json(401, "Oturum bulunamadı.");
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) return json(403, "Bu işlem için yetkiniz yok.");
  const { personelId } = await params;
  const s = await kaseGorseliGetir({ bag: tenantGerekli(ctx), tenantId: ctx.tenantId, rol: ctx.rol, personelId });
  if (s.tur === "yetkisiz") return json(403, "Bu işlem için yetkiniz yok.");
  if (s.tur === "yok") return json(404, "Görsel bulunamadı.");
  return belgeYaniti(s);
}
