"use client";

import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/datetime";

type SuAnCizgisiProps = {
  /** Çizelge penceresinin başlangıcı (bugün 08:00), epoch ms */
  gunBaslangicMs: number;
  pxPerDakika: number;
  toplamDakika: number;
  /** Oda etiket sütununun genişliği (px) — çizgi bu kadar sağdan başlar */
  solOffset: number;
};

/**
 * Dikey "şu an" çizgisi. React state kullanmaz — konum doğrudan DOM'a ref
 * üzerinden yazılır, böylece 30 saniyede bir tetiklenen güncelleme grid'i
 * yeniden render etmez.
 */
export function SuAnCizgisi({ gunBaslangicMs, pxPerDakika, toplamDakika, solOffset }: SuAnCizgisiProps) {
  const cizgiRef = useRef<HTMLDivElement>(null);
  const etiketRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const guncelle = () => {
      const el = cizgiRef.current;
      if (!el) return;
      const gecenDakika = (Date.now() - gunBaslangicMs) / 60_000;
      if (gecenDakika < 0 || gecenDakika > toplamDakika) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.left = `${solOffset + gecenDakika * pxPerDakika}px`;
      if (etiketRef.current) {
        etiketRef.current.textContent = formatTime(new Date().toISOString());
      }
    };

    guncelle();
    const id = setInterval(guncelle, 30_000);
    return () => clearInterval(id);
  }, [gunBaslangicMs, pxPerDakika, toplamDakika, solOffset]);

  return (
    <div
      ref={cizgiRef}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-20 w-px"
      style={{ display: "none" }}
    >
      <div className="h-full w-px bg-gradient-to-b from-destructive via-destructive/70 to-destructive/20" />
      <span
        ref={etiketRef}
        className="tabular-nums absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-destructive px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-white shadow"
      />
    </div>
  );
}
