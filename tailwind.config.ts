// tailwind.config.ts
// Yalnızca app/(marketing) landing sayfası için: app/(marketing)/globals.css
// içindeki `@config` direktifiyle yüklenir. Panel/portal, app/globals.css'teki
// shadcn/v4 @theme katmanını kullanır ve bu dosyadan etkilenmez.
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/(marketing)/**/*.{ts,tsx}", "./components/landing/**/*.{ts,tsx}", "./components/ui/GlassPanel.tsx", "./components/ui/GlowButton.tsx", "./components/ui/Reveal.tsx"],
  theme: {
    extend: {
      colors: {
        // Zemin katmanları — saf siyah yok, derinlik için üç kademe
        canvas: {
          DEFAULT: "#090D16", // sayfa zemini
          raised: "#0F172A", // bölüm zemini
          panel: "#1E293B", // cam kart taban rengi
        },
        // Metin katmanı
        ink: {
          DEFAULT: "#F8FAFC",
          muted: "#94A3B8",
          faint: "#64748B",
        },
        // Primary: Cyan / Electric Blue — CTA, aktif durum, canlı vurgu
        primary: {
          50: "#ECFEFF",
          100: "#CFFAFE",
          200: "#A5F3FC",
          300: "#67E8F9",
          400: "#22D3EE",
          500: "#00F2FE",
          600: "#4FACFE",
          700: "#2B7FD4",
          800: "#1E5A99",
          900: "#173F6B",
          950: "#0B2340",
        },
        // Secondary: Emerald — onay, sağlık, canlı bağlantı
        secondary: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#022C22",
        },
        // Durum renkleri marka paletinden bağımsız evrensel kalır
        danger: { 300: "#FDA4AF", 400: "#FB7185", 500: "#F43F5E", 600: "#E11D48" },
        warning: { 300: "#FCD34D", 400: "#FBBF24", 500: "#F59E0B" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,242,254,0.35), 0 8px 32px -8px rgba(0,242,254,0.45)",
        "glow-lg": "0 0 0 1px rgba(0,242,254,0.5), 0 12px 48px -8px rgba(0,242,254,0.6)",
        slot: "0 0 0 1px rgba(0,242,254,0.4), 0 0 24px -4px rgba(0,242,254,0.35)",
      },
      keyframes: {
        "live-blink": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.35", transform: "scale(0.85)" },
        },
        "slot-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(0,242,254,0.35), 0 0 18px -6px rgba(0,242,254,0.35)" },
          "50%": { boxShadow: "0 0 0 1px rgba(0,242,254,0.7), 0 0 30px -4px rgba(0,242,254,0.6)" },
        },
      },
      animation: {
        "live-blink": "live-blink 1.6s ease-in-out infinite",
        "slot-pulse": "slot-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
