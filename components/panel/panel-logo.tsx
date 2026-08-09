"use client";

import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import type { Klinik } from "@/types/klinik";
import { cn } from "@/lib/utils";

function basHarfleriCikar(ad: string): string {
  const kelimeler = ad.trim().split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) return "?";
  if (kelimeler.length === 1) return kelimeler[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (kelimeler[0][0] + kelimeler[1][0]).toLocaleUpperCase("tr-TR");
}

const HIC_ABONE_OLMA = () => () => {};

/** SSR'da false, hydration sonrası true — useEffect+setState yerine (react-hooks/set-state-in-effect). */
function useMountEdildi(): boolean {
  return useSyncExternalStore(HIC_ABONE_OLMA, () => true, () => false);
}

/**
 * Panelin üst bar'ında ve mobil menü çekmecesinde "Klinik Asistanı" sabit
 * metninin yerini alan beyaz-etiket logo. Tema koyuysa logo_url_koyu (yoksa
 * logo_url), açıksa logo_url kullanılır. next-themes SSR'da tema bilmediği
 * için "mounted" öncesi her zaman logo_url'e düşülür (TabletLogo'nun aksine
 * tema burada prop değil useTheme() ile geldiği için hydration mismatch'i
 * önlemek gerekiyor) — mount sonrası koyu temaya geçilirse sessizce değişir.
 * İkisi de yoksa veya görsel yüklenemezse (onError) klinik adının baş
 * harfleriyle marka_renkleri.primary zeminli kutuya düşer.
 */
export function PanelLogo({ klinik, className }: { klinik: Klinik; className?: string }) {
  const { resolvedTheme } = useTheme();
  const mounted = useMountEdildi();
  const [hataVar, setHataVar] = useState(false);

  const kaynak =
    mounted && resolvedTheme === "dark" ? (klinik.logo_url_koyu ?? klinik.logo_url) : klinik.logo_url;

  if (!kaynak || hataVar) {
    return (
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white",
          className
        )}
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
      alt={klinik.ad}
      loading="eager"
      className={cn("h-8 w-auto shrink-0 object-contain", className)}
      onError={() => setHataVar(true)}
    />
  );
}
