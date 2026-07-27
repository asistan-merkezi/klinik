// components/landing/CurrentTimeLine.tsx
"use client";

import { useEffect, useRef } from "react";
import { WINDOW_MINUTES } from "@/lib/schedule";

type CurrentTimeLineProps = {
  /** Çizelge penceresinin başlangıç zamanı (ms) */
  windowStartMs: number;
};

/**
 * "Şu Anki Zaman" göstergesi.
 *
 * Performans notu: burada React state YOKTUR. Konum doğrudan DOM üzerinde
 * ref ile güncellenir, dolayısıyla saniyede bir tetiklenen hiçbir render
 * yoktur. 240 dakikalık pencerede 1 saniye ≈ %0.007 yol demektir; bu
 * yüzden 1 sn'lik adım gözle sürekli akış olarak görünür ve
 * requestAnimationFrame'e gerek kalmaz.
 */
export default function CurrentTimeLine({ windowStartMs }: CurrentTimeLineProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const totalMs = WINDOW_MINUTES * 60_000;

    const update = () => {
      const el = lineRef.current;
      if (!el) return;

      const ratio = (Date.now() - windowStartMs) / totalMs;

      // Pencere dışına taşarsa çizgiyi gizle (mesai dışı senaryosu)
      if (ratio < 0 || ratio > 1) {
        el.style.opacity = "0";
        return;
      }

      el.style.opacity = "1";
      el.style.top = `${(ratio * 100).toFixed(4)}%`;

      if (labelRef.current) {
        labelRef.current.textContent = new Intl.DateTimeFormat("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date());
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [windowStartMs]);

  return (
    <div
      ref={lineRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 opacity-0"
      style={{ top: "50%" }}
    >
      <div className="relative flex items-center">
        <span
          ref={labelRef}
          className="tabular -ml-1 rounded-md bg-danger-500 px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-white shadow-lg shadow-danger-500/40"
        />
        <div className="h-px flex-1 bg-gradient-to-r from-danger-500 via-danger-500/70 to-transparent" />
      </div>
    </div>
  );
}
