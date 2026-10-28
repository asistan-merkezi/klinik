import { isBasvuruFormuIcerikHtml } from "@/lib/pdf/is-basvuru-formu-sablon";
import { pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";

export function isBasvuruFormuHtmlOlustur({
  klinikAdi,
  logoDataUri,
}: {
  klinikAdi: string;
  logoDataUri: string | null;
}): string {
  const icerikHtml = isBasvuruFormuIcerikHtml({ klinikAdi, logoDataUri });
  return pdfBelgesiOlustur(icerikHtml);
}
