"use client";

import { useEffect, useState } from "react";

/**
 * Saniyede bir güncellenen izole saat. Kendi state'ini tutar; parent'ı
 * (CanliCizelge) yeniden render etmez.
 */
export function CanliSaat() {
  const [saat, setSaat] = useState<string | null>(null);

  useEffect(() => {
    const guncelle = () => setSaat(new Date().toLocaleTimeString("tr-TR"));
    guncelle();
    const id = setInterval(guncelle, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <time suppressHydrationWarning className="font-mono text-sm tabular-nums text-muted-foreground">
      {saat ?? "--:--:--"}
    </time>
  );
}
