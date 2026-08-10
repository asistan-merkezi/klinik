"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "lg";

export function PdfIndirButonu({
  endpoint,
  dosyaAdi,
  etiket,
  variant = "default",
  size = "default",
}: {
  endpoint: string;
  dosyaAdi: string;
  etiket: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function pdfOlustur() {
    setIndiriliyor(true);
    setHata(null);
    try {
      const yanit = await fetch(endpoint);
      if (!yanit.ok) {
        throw new Error(`PDF isteği başarısız: ${yanit.status}`);
      }

      const blob = await yanit.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dosyaAdi;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF oluşturma hatası:", err);
      setHata("PDF oluşturulamadı, lütfen tekrar deneyin.");
    } finally {
      setIndiriliyor(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={variant} size={size} onClick={pdfOlustur} disabled={indiriliyor}>
        {indiriliyor ? <Loader2 className="animate-spin" /> : <Download />}
        {indiriliyor ? "PDF oluşturuluyor..." : etiket}
      </Button>
      {hata && <span className="text-xs text-destructive">{hata}</span>}
    </div>
  );
}
