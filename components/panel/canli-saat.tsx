"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/datetime";

/**
 * Saniyede bir güncellenen izole saat. Kendi state'ini tutar; parent'ı
 * (CanliCizelge) yeniden render etmez. İstanbul saati sabit (formatClock),
 * tarayıcının/sunucunun ambient TZ'sine bağlı değil.
 */
export function CanliSaat() {
  const [saat, setSaat] = useState<string | null>(null);

  useEffect(() => {
    const guncelle = () => setSaat(formatClock(new Date().toISOString()));
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
