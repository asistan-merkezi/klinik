import { isBasvuruFormuIcerikHtml } from "@/lib/pdf/is-basvuru-formu-sablon";
import { gorseliDataUriyeCevir, pdfBelgesiOlustur } from "@/lib/pdf/pdf-yardimcilari";

export async function isBasvuruFormuHtmlOlustur({
  klinikAdi,
  logoUrl,
}: {
  klinikAdi: string;
  logoUrl: string | null;
}): Promise<string> {
  const logoDataUri = await gorseliDataUriyeCevir(logoUrl);
  const icerikHtml = isBasvuruFormuIcerikHtml({ klinikAdi, logoDataUri });
  return pdfBelgesiOlustur(icerikHtml);
}
