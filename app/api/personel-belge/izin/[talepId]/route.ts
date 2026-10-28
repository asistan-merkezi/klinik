// İzin talebi belgesi — yalnız yetkili (talep sahibi / yönetici / muhasebe), kendi kliniğinin belgesi. Ayrıntı: lib/dosya/personel-belge.ts.
import { getSessionContext, tenantGerekli } from "@/lib/auth/oturum";
import { belgeYaniti, izinBelgesiGetir } from "@/lib/dosya/personel-belge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (durum: number, hata: string) => Response.json({ hata }, { status: durum, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ talepId: string }> }) {
  const ctx = await getSessionContext(request.headers);
  if (!ctx) return json(401, "Oturum bulunamadı.");
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) return json(403, "Bu işlem için yetkiniz yok.");
  const { talepId } = await params;
  const s = await izinBelgesiGetir({ bag: tenantGerekli(ctx), tenantId: ctx.tenantId, rol: ctx.rol, kullaniciId: ctx.userId, talepId });
  if (s.tur === "yetkisiz") return json(403, "Bu işlem için yetkiniz yok.");
  if (s.tur === "yok") return json(404, "Belge bulunamadı.");
  return belgeYaniti(s);
}
