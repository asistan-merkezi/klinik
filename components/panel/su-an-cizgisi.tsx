"use client";

import { useEffect, useRef } from "react";

type SuAnCizgisiProps = {
  /** Çizelge penceresinin başlangıcı (bugün 08:00), epoch ms */
  gunBaslangicMs: number;
  pxPerDakika: number;
  toplamDakika: number;
};

/**
 * "Şu an" çizgisi. React state kullanmaz — konum doğrudan DOM'a ref
 * üzerinden yazılır, böylece 30 saniyede bir tetiklenen güncelleme listeyi
 * yeniden render etmez.
 */
export function SuAnCizgisi({ gunBaslangicMs, pxPerDakika, toplamDakika }: SuAnCizgisiProps) {
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
      el.style.display = "flex";
      el.style.top = `${gecenDakika * pxPerDakika}px`;
      if (etiketRef.current) {
        etiketRef.current.textContent = new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    };

    guncelle();
    const id = setInterval(guncelle, 30_000);
    return () => clearInterval(id);
  }, [gunBaslangicMs, pxPerDakika, toplamDakika]);

  return (
    <div
      ref={cizgiRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 items-center"
      style={{ display: "none" }}
    >
      <span
        ref={etiketRef}
        className="tabular-nums -ml-1 rounded-md bg-destructive px-1.5 py-0.5 font-mono text-xs font-bold leading-none text-white shadow"
      />
      <div className="h-px flex-1 bg-gradient-to-r from-destructive via-destructive/70 to-transparent" />
    </div>
  );
}
