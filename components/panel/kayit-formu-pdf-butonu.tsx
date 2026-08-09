"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KayitFormuPdfButonu() {
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function pdfOlustur() {
    setIndiriliyor(true);
    setHata(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const sayfalar = Array.from(document.querySelectorAll<HTMLElement>(".pdf-sayfa"));
      let pdf: InstanceType<typeof jsPDF> | null = null;
      const genislikMm = 210;

      for (const sayfa of sayfalar) {
        const canvas = await html2canvas(sayfa, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const yukseklikMm = (canvas.height * genislikMm) / canvas.width;
        const imgData = canvas.toDataURL("image/jpeg", 0.95);

        if (!pdf) {
          pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [genislikMm, yukseklikMm] });
        } else {
          pdf.addPage([genislikMm, yukseklikMm], "portrait");
        }
        pdf.addImage(imgData, "JPEG", 0, 0, genislikMm, yukseklikMm);
      }

      pdf?.save("hasta-kayit-formu.pdf");
    } catch (err) {
      console.error("Kayıt formu PDF oluşturma hatası:", err);
      setHata("PDF oluşturulamadı, lütfen tekrar deneyin.");
    } finally {
      setIndiriliyor(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={pdfOlustur} disabled={indiriliyor}>
        {indiriliyor ? <Loader2 className="animate-spin" /> : <Download />}
        {indiriliyor ? "PDF oluşturuluyor..." : "PDF olarak indir"}
      </Button>
      {hata && <span className="text-xs text-destructive">{hata}</span>}
    </div>
  );
}
