import { kayitFormuIcerikHtml } from "@/lib/pdf/kayit-formu-sablon";
import { pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";

export function kayitFormuHtmlOlustur({
  klinikAdi,
  logoDataUri,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
}): string {
  const icerikHtml = kayitFormuIcerikHtml({ klinikAdi, logoDataUri });
  return pdfBelgesiOlustur(icerikHtml);
}
