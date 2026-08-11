"use client";

import { useEffect, useRef } from "react";
import { bildirimleriGoruldiIsaretle } from "./actions";

/**
 * Görünmez bileşen — sayfa gerçekten mount olunca (sidebar/butonun renkli
 * göründüğü Link'in prefetch'i DEĞİL, gerçek navigasyon) ekrandaki anket/seans
 * değerlendirmesi id'lerini "görüldü" işaretler. useRef ile aynı id listesi
 * için ikinci kez tetiklenmesi engellenir (StrictMode/yeniden render).
 */
export function GoruluIsaretleyici({ anketIdleri, seansIdleri }: { anketIdleri: string[]; seansIdleri: string[] }) {
  const isaretlendi = useRef(false);

  useEffect(() => {
    if (isaretlendi.current) return;
    if (anketIdleri.length === 0 && seansIdleri.length === 0) return;
    isaretlendi.current = true;
    bildirimleriGoruldiIsaretle(anketIdleri, seansIdleri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
