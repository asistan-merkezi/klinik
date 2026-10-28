import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { kayitFormuHtmlOlustur } from "@/lib/pdf/kayit-formu-html";
import { klinikLogosuDataUri } from "@/lib/pdf/pdf-yardimcilari";
import { pdfRotasiCalistir } from "@/lib/pdf/rota";

// Puppeteer Node.js API'lerine (child_process, fs) ihtiyaç duyar — Edge runtime'da çalışmaz.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(istek: Request) {
  return pdfRotasiCalistir(istek, ["klinik_admin", "resepsiyon", "terapist", "muhasebe"], async (bag) => {
    const klinik = (await withTenant(bag, (tx) => tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1)))[0];
    const html = kayitFormuHtmlOlustur({ klinikAdi: klinik?.ad ?? "Klinik", logoDataUri: await klinikLogosuDataUri(bag.tenantId) });
    return { html, dosyaAdi: "hasta-kayit-formu.pdf" };
  });
}
