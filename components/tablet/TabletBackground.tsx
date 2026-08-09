import { memo } from "react";

/**
 * Statik doku katmanı: nokta grid + topografik eğriler + durum rengine göre
 * aura gradient. Animasyon/seed yok — her yüklemede birebir aynı, 60fps
 * hedefi için re-render'a girmemesi amacıyla memo'lu ve tek prop'u (renk +
 * auraOpacity) durum değişince değişiyor, SVG geometrisi sabit kalıyor.
 */
function TabletBackgroundBase({ renk, auraOpacity }: { renk: string; auraOpacity: number }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="tablet-doku-nokta" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle
            cx="13"
            cy="13"
            r="1.1"
            fill="var(--tablet-doku-nokta)"
            style={{ fillOpacity: "var(--tablet-doku-nokta-opacity)" }}
          />
        </pattern>
        <radialGradient id="tablet-aura" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={renk} stopOpacity={auraOpacity} />
          <stop offset="100%" stopColor={renk} stopOpacity={0} />
        </radialGradient>
      </defs>

      <rect width="1600" height="1000" fill="url(#tablet-doku-nokta)" />
      <rect width="1600" height="1000" fill="url(#tablet-aura)" />

      <path
        d="M -50 720 C 300 660, 550 780, 850 700 S 1400 640, 1650 710"
        fill="none"
        stroke="#38BDF8"
        strokeOpacity={0.1}
        strokeWidth={2}
      />
      <path
        d="M -50 820 C 320 770, 600 880, 900 810 S 1420 750, 1650 830"
        fill="none"
        stroke="#38BDF8"
        strokeOpacity={0.07}
        strokeWidth={2}
      />
      <path
        d="M -50 920 C 340 880, 650 970, 950 910 S 1440 860, 1650 930"
        fill="none"
        stroke="#38BDF8"
        strokeOpacity={0.05}
        strokeWidth={2}
      />
    </svg>
  );
}

export const TabletBackground = memo(TabletBackgroundBase);
