import { cariHareketlerIcerikHtml, type CariHareketlerPdfSatir } from "@/lib/pdf/cari-hareketler-sablon";
import { gorseliDataUriyeCevir, pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";

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
  const olusturmaTarihi = new Date().toLocaleString("tr-TR");
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
