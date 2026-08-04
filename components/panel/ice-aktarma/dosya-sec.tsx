"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { dosyadanSatirlarOku, type OkunmusDosya } from "@/lib/ice-aktarma/dosya-oku";

export function DosyaSec({ onOkundu }: { onOkundu: (dosya: OkunmusDosya, dosyaAdi: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function dosyaSecildi(event: React.ChangeEvent<HTMLInputElement>) {
    const dosya = event.target.files?.[0];
    event.target.value = "";
    if (!dosya) return;

    setHata(null);
    setOkunuyor(true);
    try {
      const sonuc = await dosyadanSatirlarOku(dosya);
      if (sonuc.satirlar.length === 0) {
        setHata("Dosyada okunabilir satır bulunamadı. İlk satır sütun başlıkları olmalı.");
        return;
      }
      onOkundu(sonuc, dosya.name);
    } catch (err) {
      console.error("Arşiv dosyası okunamadı:", err);
      setHata("Dosya okunamadı — .xlsx, .xls veya .csv formatında olduğundan emin olun.");
    } finally {
      setOkunuyor(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-dashed border-border bg-surface-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Eski programdan aldığınız <strong>.xlsx</strong>, <strong>.xls</strong> veya <strong>.csv</strong> dosyasını
          seçin. İlk satır sütun başlıkları olmalı.
        </p>
        <Button type="button" variant="outline" className="mt-3" disabled={okunuyor} onClick={() => inputRef.current?.click()}>
          {okunuyor ? "Okunuyor..." : "Dosya Seç"}
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={dosyaSecildi} />
      </div>
      {hata && <p className="text-sm text-destructive">{hata}</p>}
    </div>
  );
}
