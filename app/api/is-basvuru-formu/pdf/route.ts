import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pdfIcinTarayiciBaslat } from "@/lib/pdf/browser";
import { isBasvuruFormuHtmlOlustur } from "@/lib/pdf/is-basvuru-formu-html";

// Puppeteer Node.js API'lerine (child_process, fs) ihtiyaç duyar — Edge
// runtime'da çalışmaz.
export const runtime = "nodejs";
// Soğuk başlatmada 67MB'lık brotli chromium binary'sinin /tmp'ye açılması +
// Chromium açılışı + render birkaç saniye sürebilir — Hasta Kayıt Formu
// PDF'inde 30s bazen yetmiyordu, aynı gerekçeyle Hobby planının izin
// verdiği üst sınıra (60s) çekildi.
export const maxDuration = 60;

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

  const html = await isBasvuruFormuHtmlOlustur({
    klinikAdi: klinik?.ad ?? "Klinik",
    logoUrl: klinik?.logo_url ?? null,
  });

  try {
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
          "Content-Disposition": 'attachment; filename="is-basvuru-formu.pdf"',
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    // Vercel fonksiyon loglarında görünür — sorun çıktığında (chromium
    // başlatma, protokol uyuşmazlığı vb.) buradan teşhis edilebilir.
    console.error("İş başvuru formu PDF oluşturma hatası:", err);
    return NextResponse.json({ error: "PDF oluşturulamadı." }, { status: 500 });
  }
}
