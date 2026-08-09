"use client";

import { useEffect, useRef, useState } from "react";

const ETKINLIK_OLAYLARI = ["mousemove", "touchstart", "keydown"] as const;

/** `esikMs` süresince mousemove/touchstart/keydown olmazsa true döner (ekran koruyucu). Herhangi bir etkinlikte anında sıfırlanır. */
export function useIdle(esikMs: number): boolean {
  const [bosta, setBosta] = useState(false);
  const zamanlayiciRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function sifirla() {
      setBosta(false);
      if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
      zamanlayiciRef.current = setTimeout(() => setBosta(true), esikMs);
    }

    sifirla();
    ETKINLIK_OLAYLARI.forEach((olay) => window.addEventListener(olay, sifirla));

    return () => {
      if (zamanlayiciRef.current) clearTimeout(zamanlayiciRef.current);
      ETKINLIK_OLAYLARI.forEach((olay) => window.removeEventListener(olay, sifirla));
    };
  }, [esikMs]);

  return bosta;
}
