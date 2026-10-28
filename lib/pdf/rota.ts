// PDF route'ları için ortak kapı: oturum + personel + klinik bağlamı + rol -> HTML hazırlama (tenant bağlamında) -> pdfUret (semafor, zaman aşımı,
// sertleştirilmiş Chrome). Çıktı YALNIZ yetkili ve tenant'a bağlı kullanıcıya gider; "private, no-store" (ara önbellekte kalmaz).
import { getSessionContext, tenantGerekli, type OturumBaglami, type OturumRolu } from "@/lib/auth/oturum";
import type { TenantBaglami } from "@/lib/db";
import { sinirKontrol } from "@/lib/guvenlik/istek-siniri";
import { PdfKuyrukDolu } from "./semafor";
import { PdfZamanAsimi, pdfUret } from "./browser";

type Hazir = { html: string; dosyaAdi: string } | { hata: string; durum: 400 | 404 };

const json = (durum: number, hata: string, ek: Record<string, string> = {}) =>
  Response.json({ error: hata }, { status: durum, headers: { "Cache-Control": "no-store", ...ek } });

export async function pdfRotasiCalistir(
  istek: Request,
  izinliRoller: readonly OturumRolu[],
  hazirla: (bag: TenantBaglami, ctx: OturumBaglami) => Promise<Hazir>
): Promise<Response> {
  const ctx = await getSessionContext(istek.headers);
  if (!ctx) return json(401, "Yetkisiz.");
  // super_admin yalnız aktif destek bağlamında (tenantId dolu) geçer; hasta oturumu ve geçici şifreli oturum hiçbir PDF'e giremez.
  if (ctx.tur !== "personel" || !ctx.tenantId || ctx.sifreDegistirmeli) return json(403, "Bu işlem için yetkiniz yok.");
  if (ctx.rol !== "super_admin" && !izinliRoller.includes(ctx.rol)) return json(403, "Bu işlem için yetkiniz yok.");

  // Kullanıcı başına hız sınırı (Chrome pahalıdır): 10 dk'da 30 PDF; sayaç okunamazsa FAIL-CLOSED.
  const sinir = await sinirKontrol("pdf", ctx.userId);
  if (!sinir.izin) return json(sinir.durum, sinir.mesaj, { "Retry-After": sinir.durum === 429 ? "60" : "10" });

  const hazir = await hazirla(tenantGerekli(ctx), ctx);
  if ("hata" in hazir) return json(hazir.durum, hazir.hata);

  try {
    const { pdf, engellenenIstekler } = await pdfUret(hazir.html);
    if (engellenenIstekler.length > 0) console.warn("PDF şablonu dış kaynak istedi (engellendi):", engellenenIstekler.slice(0, 5));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${hazir.dosyaAdi}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof PdfKuyrukDolu) return json(503, e.message, { "Retry-After": "10" });
    if (e instanceof PdfZamanAsimi) return json(504, "PDF üretimi zaman aşımına uğradı.");
    console.error("PDF oluşturma hatası:", e instanceof Error ? e.message : e);
    return json(500, "PDF oluşturulamadı.");
  }
}
