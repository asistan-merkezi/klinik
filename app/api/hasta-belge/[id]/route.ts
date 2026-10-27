// Hasta belgesi sunumu — belgeler web kökü dışındaki DOSYA_KOKU altında durur ve YALNIZ bu yetkili route'tan servis edilir.
// ?islem=goruntule (varsayılan, erişim izi: audit 'select') | indir (audit 'select' + 'indirme') | kucuk (liste küçük resmi, iz yok).
import { getSessionContext, tenantGerekli } from "@/lib/auth/oturum";
import { belgeIcerigiGetir, type BelgeIslem } from "@/lib/belge/servis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISLEMLER: readonly BelgeIslem[] = ["goruntule", "indir", "kucuk"];
const json = (durum: number, hata: string) => Response.json({ hata }, { status: durum, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext(request.headers);
  if (!ctx) return json(401, "Oturum bulunamadı.");
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) return json(403, "Bu işlem için yetkiniz yok.");

  const istenen = new URL(request.url).searchParams.get("islem") ?? "goruntule";
  if (!(ISLEMLER as readonly string[]).includes(istenen)) return json(400, "Geçersiz işlem.");
  const { id } = await params;

  const sonuc = await belgeIcerigiGetir({ bag: tenantGerekli(ctx), rol: ctx.rol, belgeId: id, islem: istenen as BelgeIslem });
  if (sonuc.tur === "yetkisiz") return json(403, "Bu işlem için yetkiniz yok.");
  if (sonuc.tur === "yok") return json(404, "Belge bulunamadı.");

  return new Response(new Uint8Array(sonuc.veri), {
    headers: {
      "Content-Type": sonuc.mime,
      "Content-Disposition": `${istenen === "indir" ? "attachment" : "inline"}; filename="${sonuc.dosyaAdi}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Belge içeriği hiçbir bağlamda betik çalıştıramaz.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
