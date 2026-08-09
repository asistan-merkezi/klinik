"use client";

import { PdfIndirButonu } from "@/components/panel/pdf-indir-butonu";

export function IsBasvuruFormuPdfButonu() {
  return (
    <PdfIndirButonu
      endpoint="/api/is-basvuru-formu/pdf"
      dosyaAdi="is-basvuru-formu.pdf"
      etiket="İş Başvuru Formu (PDF)"
      variant="outline"
    />
  );
}
