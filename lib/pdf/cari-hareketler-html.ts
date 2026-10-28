import { cariHareketlerIcerikHtml, type CariHareketlerPdfSatir } from "@/lib/pdf/cari-hareketler-sablon";
import { pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";
import { formatDateTime } from "@/lib/datetime";

export function cariHareketlerHtmlOlustur({
  klinikAdi,
  logoDataUri,
  hastaAdSoyad,
  guncelBakiyeMetin,
  satirlar,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
  hastaAdSoyad: string;
  guncelBakiyeMetin: string;
  satirlar: CariHareketlerPdfSatir[];
}): string {
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
