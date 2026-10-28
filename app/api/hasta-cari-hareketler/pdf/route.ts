import { z } from "zod";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { cariHareketlerHtmlOlustur } from "@/lib/pdf/cari-hareketler-html";
import type { CariHareketlerPdfSatir } from "@/lib/pdf/cari-hareketler-sablon";
import { klinikLogosuDataUri } from "@/lib/pdf/pdf-yardimcilari";
import { pdfRotasiCalistir } from "@/lib/pdf/rota";
import { bakiyeHareketleriGetir, hastaBakiyesiGetir } from "@/lib/hasta/cari-sorgular";
import { hareketleriGorunumeCevir } from "@/lib/hasta/bakiye-hareket-gorunum";
import { formatDate, formatTime } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

/** Hasta cari dökümü: terapist HARİÇ (finans verisi). Hasta RLS ile yalnız çağıranın kliniğinden bulunur; başka kliniğin hastası için 404. */
export async function GET(istek: Request) {
  const hastaId = z.string().uuid().safeParse(new URL(istek.url).searchParams.get("hastaId"));
  return pdfRotasiCalistir(istek, ["klinik_admin", "resepsiyon", "muhasebe"], async (bag) => {
    if (!hastaId.success) return { hata: "hastaId gerekli.", durum: 400 };
    const veri = await withTenant(bag, async (tx) => {
      const hasta = (await tx.select({ ad: sema.hasta.adSoyad }).from(sema.hasta).where(eq(sema.hasta.id, hastaId.data)).limit(1))[0];
      if (!hasta) return null;
      return {
        hasta,
        klinikAd: (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0]?.ad ?? "Klinik",
        hareketler: await bakiyeHareketleriGetir(tx, hastaId.data, 1000),
        bakiye: await hastaBakiyesiGetir(tx, hastaId.data),
      };
    });
    if (!veri) return { hata: "Hasta bulunamadı.", durum: 404 };

    const gorunumler = hareketleriGorunumeCevir(veri.hareketler, veri.bakiye);
    const satirlar: CariHareketlerPdfSatir[] = gorunumler.map(({ hareket, islemAdi, terapistAdi, bakiyeSonrasi, odemeYontemMetni, tutarBrut }) => {
      const tutarNegatifMi = hareket.tur === "borc" || hareket.tur === "iade";
      return {
        tarih: formatDate(hareket.created_at),
        saat: formatTime(hareket.created_at),
        islemTuru: islemAdi,
        // Bağımsız "Ödeme Ekle" kayıtlarında odeme_satiri yok: ödeme tipi açıklamaya etiket olarak gömülü.
        yontemMetni: hareket.tur === "odeme" || hareket.tur === "iade" ? odemeYontemMetni || hareket.aciklama : null,
        terapist: terapistAdi,
        tutar: `${tutarNegatifMi ? "-" : "+"}${paraFormat(tutarBrut)}`,
        tutarNegatifMi,
        bakiye: paraFormat(bakiyeSonrasi),
        negatifMi: bakiyeSonrasi < 0,
      };
    });
    const html = cariHareketlerHtmlOlustur({
      klinikAdi: veri.klinikAd,
      logoDataUri: await klinikLogosuDataUri(bag.tenantId),
      hastaAdSoyad: veri.hasta.ad,
      guncelBakiyeMetin: paraFormat(veri.bakiye),
      satirlar,
    });
    return { html, dosyaAdi: "cari-hareketler.pdf" };
  });
}
