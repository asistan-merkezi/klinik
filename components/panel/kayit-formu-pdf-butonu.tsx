"use client";

import { PdfIndirButonu } from "@/components/panel/pdf-indir-butonu";

export function KayitFormuPdfButonu() {
  return (
    <PdfIndirButonu
      endpoint="/api/hasta-kayit-formu/pdf"
      dosyaAdi="hasta-kayit-formu.pdf"
      etiket="PDF olarak indir"
    />
  );
}
