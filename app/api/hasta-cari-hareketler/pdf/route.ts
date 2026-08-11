import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pdfIcinTarayiciBaslat } from "@/lib/pdf/browser";
import { cariHareketlerHtmlOlustur } from "@/lib/pdf/cari-hareketler-html";
import { hareketleriGorunumeCevir } from "@/lib/hasta/bakiye-hareket-gorunum";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";
import type { CariHareketlerPdfSatir } from "@/lib/pdf/cari-hareketler-sablon";
import { formatDate, formatTime } from "@/lib/datetime";

// Puppeteer Node.js API'lerine ihtiyaç duyar — Edge runtime'da çalışmaz.
export const runtime = "nodejs";
export const maxDuration = 60;

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export async function GET(request: NextRequest) {
  const hastaId = request.nextUrl.searchParams.get("hastaId");
  if (!hastaId) {
    return NextResponse.json({ error: "hastaId gerekli." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol, klinik_id")
    .eq("id", user.id)
    .single();

  if (!kullanici || kullanici.rol === "terapist") {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  // RLS klinik_id = current_klinik_id() ile sınırlar; sonuç dönerse hasta kendi kliniğindendir.
  const { data: hasta } = await supabase.from("hasta").select("ad_soyad").eq("id", hastaId).single();
  if (!hasta) {
    return NextResponse.json({ error: "Hasta bulunamadı." }, { status: 404 });
  }

  const [bakiyeHareketSonucu, ozetSonucu, klinikSonucu] = await Promise.all([
    supabase
      .from("hasta_bakiye_hareket")
      .select(
        "id, tur, tutar, aciklama, created_at, odeme_id, " +
          "randevu(terapist(personel(ad_soyad)), islem_tanimi(ad, vita_fiyat)), " +
          "odeme(iskonto_tutari, odeme_kalemi(miktar, birim_fiyat, islem_tanimi(ad, vita_fiyat), paket_satis(paket(ad))), odeme_satiri(yontem))"
      )
      .eq("hasta_id", hastaId)
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<HastaBakiyeHareket[]>(),
    supabase.from("v_hasta_ozet").select("bakiye").eq("hasta_id", hastaId).maybeSingle<{ bakiye: number }>(),
    supabase.from("klinik").select("ad, logo_url").eq("id", kullanici.klinik_id ?? "").maybeSingle(),
  ]);

  const guncelBakiye = ozetSonucu.data?.bakiye ?? 0;
  const hareketGorunumleri = hareketleriGorunumeCevir(bakiyeHareketSonucu.data ?? [], guncelBakiye);

  const satirlar: CariHareketlerPdfSatir[] = hareketGorunumleri.map(
    ({ hareket, islemAdi, terapistAdi, bakiyeSonrasi, odemeYontemMetni }) => {
      return {
        tarih: formatDate(hareket.created_at),
        saat: formatTime(hareket.created_at),
        islemTuru: islemAdi,
        yontemMetni: hareket.tur === "odeme" && odemeYontemMetni ? odemeYontemMetni : null,
        terapist: terapistAdi,
        bakiye: paraFormat(bakiyeSonrasi),
        negatifMi: bakiyeSonrasi < 0,
      };
    }
  );

  const html = await cariHareketlerHtmlOlustur({
    klinikAdi: klinikSonucu.data?.ad ?? "Klinik",
    logoUrl: klinikSonucu.data?.logo_url ?? null,
    hastaAdSoyad: hasta.ad_soyad,
    guncelBakiyeMetin: paraFormat(guncelBakiye),
    satirlar,
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
          "Content-Disposition": 'attachment; filename="cari-hareketler.pdf"',
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("Cari hareketler PDF oluşturma hatası:", err);
    return NextResponse.json({ error: "PDF oluşturulamadı." }, { status: 500 });
  }
}
