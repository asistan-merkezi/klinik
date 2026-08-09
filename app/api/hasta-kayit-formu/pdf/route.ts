import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pdfIcinTarayiciBaslat } from "@/lib/pdf/browser";
import { kayitFormuHtmlOlustur } from "@/lib/pdf/kayit-formu-html";

// Puppeteer Node.js API'lerine (child_process, fs) ihtiyaç duyar — Edge
// runtime'da çalışmaz.
export const runtime = "nodejs";
// Soğuk başlatma + Chromium açılışı + render birkaç saniye sürebilir.
// Vercel Hobby planında üst sınır 60s'dir; Pro planda 300s'ye çıkarılabilir.
export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  const { data: klinik } = await supabase
    .from("klinik")
    .select("ad, logo_url")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

  const html = await kayitFormuHtmlOlustur({
    klinikAdi: klinik?.ad ?? "Klinik",
    logoUrl: klinik?.logo_url ?? null,
  });

  const browser = await pdfIcinTarayiciBaslat();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("print");
    await page.evaluateHandle("document.fonts.ready");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="hasta-kayit-formu.pdf"',
      },
    });
  } finally {
    await browser.close();
  }
}
