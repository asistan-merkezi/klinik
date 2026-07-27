// components/landing/LiveClock.tsx
"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/schedule";

/**
 * Saniyesi saniyesine akan dijital saat.
 *
 * Performans notu: bu bileşen bilinçli olarak yaprak (leaf) tutulur.
 * setInterval yalnızca burada yaşar, dolayısıyla saniyede bir yeniden
 * render edilen tek şey bu küçük metin düğümüdür — çizelge kartının
 * tamamı değil.
 */
export default function LiveClock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(formatClock(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      suppressHydrationWarning
      className="tabular font-mono text-sm font-medium tracking-tight text-ink"
    >
      {time ?? "--:--:--"}
    </time>
  );
}
