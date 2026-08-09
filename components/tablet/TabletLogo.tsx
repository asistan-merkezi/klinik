"use client";

import { useState } from "react";
import type { Klinik } from "@/types/klinik";
import type { TabletTemasi } from "@/types/tablet-ayarlari";

function basHarfleriCikar(ad: string): string {
  const kelimeler = ad.trim().split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) return "?";
  if (kelimeler.length === 1) return kelimeler[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (kelimeler[0][0] + kelimeler[1][0]).toLocaleUpperCase("tr-TR");
}

/**
 * Üst bar logosu. Kaynak zinciri: tema koyuysa logo_url_koyu (yoksa
 * logo_url), tema açıksa logo_url; ikisi de yoksa veya görsel yüklenemezse
 * (onError) klinik adının baş harfleriyle marka_renkleri.primary zeminli
 * kutuya düşer. Sabit h-8 — yüklenirken/düşerken layout kaymaz.
 */
export function TabletLogo({ klinik, tema }: { klinik: Klinik; tema: TabletTemasi }) {
  const kaynak = tema === "koyu" ? (klinik.logo_url_koyu ?? klinik.logo_url) : klinik.logo_url;
  const [hataVar, setHataVar] = useState(false);

  if (!kaynak || hataVar) {
    return (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
        style={{ backgroundColor: klinik.marka_renkleri?.primary || "var(--primary)" }}
      >
        {basHarfleriCikar(klinik.ad)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={kaynak}
      alt={`${klinik.ad} logosu`}
      loading="eager"
      className="h-8 w-auto shrink-0 object-contain"
      onError={() => setHataVar(true)}
    />
  );
}
