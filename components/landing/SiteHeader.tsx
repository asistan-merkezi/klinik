// components/landing/SiteHeader.tsx
import Link from "next/link";
import { Stethoscope } from "lucide-react";

const NAV = [
  { href: "#ozellikler", label: "Özellikler" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/destek", label: "Destek" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Stethoscope className="h-5 w-5 text-primary-500" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Klinik Asistanı</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/giris"
            className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Giriş yap
          </Link>
          <Link
            href="/kayit"
            className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-4 py-2 text-sm font-semibold text-primary-200 transition duration-200 hover:bg-primary-500/20"
          >
            Ücretsiz deneyin
          </Link>
        </div>
      </div>
    </header>
  );
}
