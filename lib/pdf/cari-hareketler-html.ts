import { cariHareketlerIcerikHtml, type CariHareketlerPdfSatir } from "@/lib/pdf/cari-hareketler-sablon";
import { gorseliDataUriyeCevir, pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";
import { formatDateTime } from "@/lib/datetime";

export async function cariHareketlerHtmlOlustur({
  klinikAdi,
  logoUrl,
  hastaAdSoyad,
  guncelBakiyeMetin,
  satirlar,
}: {
  klinikAdi: string;
  logoUrl: string | null;
  hastaAdSoyad: string;
  guncelBakiyeMetin: string;
  satirlar: CariHareketlerPdfSatir[];
}): Promise<string> {
  const logoDataUri = await gorseliDataUriyeCevir(logoUrl);
  const olusturmaTarihi = formatDateTime(new Date().toISOString());
  const icerikHtml = cariHareketlerIcerikHtml({
    klinikAdi,
    logoDataUri,
    hastaAdSoyad,
    guncelBakiyeMetin,
    olusturmaTarihi,
    satirlar,
  });
  return pdfBelgesiOlustur(icerikHtml);
}
