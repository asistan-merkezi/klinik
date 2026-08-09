"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UserCog,
  CalendarDays,
  Package,
  DoorOpen,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cikisYap } from "@/app/(app)/panel/actions";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { ThemeToggle } from "@/components/theme-toggle";
import { PanelLogo } from "@/components/panel/panel-logo";
import type { Klinik } from "@/types/klinik";

const ANA_OGELER = [
  { href: "/panel", label: "Ana Ekran", icon: Home, tamEslesme: true },
  { href: "/panel/hastalar", label: "Hastalar", icon: Users },
  { href: "/panel/personel", label: "Personel", icon: UserCog },
  { href: "/panel/randevular", label: "Randevular", icon: CalendarDays },
  { href: "/panel/paketler", label: "Paketler", icon: Package },
  { href: "/panel/kaynaklar", label: "Donanım", icon: DoorOpen },
];

function girdiAktifMi(pathname: string, href: string, tamEslesme?: boolean) {
  if (tamEslesme) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarIcerik({
  klinik,
  kullaniciAdi,
  kullaniciRolu,
  pathname,
  linkTiklandi,
  temaGecisiGoster,
}: {
  klinik: Klinik;
  kullaniciAdi: string;
  kullaniciRolu: string;
  pathname: string;
  linkTiklandi?: () => void;
  temaGecisiGoster?: boolean;
}) {
  return (
    <>
      <div className="border-b border-sidebar-border px-4 py-4">
        <PanelLogo klinik={klinik} />
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {kullaniciAdi} — {kullaniciRolu}
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {ANA_OGELER.map((oge) => (
          <Link
            key={oge.href}
            href={oge.href}
            onClick={linkTiklandi}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              girdiAktifMi(pathname, oge.href, oge.tamEslesme)
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <oge.icon className="size-4 shrink-0" aria-hidden />
            {oge.label}
          </Link>
        ))}

        {MENU_GRUPLARI.map((grup) => {
          const grupHref = `/panel/${grup.key}`;
          const grupAktif =
            girdiAktifMi(pathname, grupHref) || grup.ogeler.some((o) => girdiAktifMi(pathname, o.href));

          return (
            <Link
              key={grup.key}
              href={grupHref}
              onClick={linkTiklandi}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                grupAktif
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <grup.icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 text-left">{grup.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <form action={cikisYap} className="flex-1">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            Çıkış yap
          </button>
        </form>
        {temaGecisiGoster && <ThemeToggle variant="inline" />}
      </div>
    </>
  );
}

export function PanelSidebar({
  klinik,
  kullaniciAdi,
  kullaniciRolu,
  children,
}: {
  klinik: Klinik;
  kullaniciAdi: string;
  kullaniciRolu: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuAcik, setMenuAcik] = useState(false);
  const dokunmaBaslangici = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMenuAcik(false);
  }, [pathname]);

  function dokunmaBasladi(e: React.TouchEvent) {
    if (menuAcik) return;
    const dokunma = e.touches[0];
    if (dokunma.clientX > 24) return; // sadece ekranın sol kenarından başlayan kaydırmalar
    dokunmaBaslangici.current = { x: dokunma.clientX, y: dokunma.clientY };
  }

  function dokunmaHareketEtti(e: React.TouchEvent) {
    const baslangic = dokunmaBaslangici.current;
    if (!baslangic) return;
    const dokunma = e.touches[0];
    const dx = dokunma.clientX - baslangic.x;
    const dy = dokunma.clientY - baslangic.y;
    if (Math.abs(dy) > 40) {
      dokunmaBaslangici.current = null; // dikey kaydırma, iptal et
    } else if (dx > 60) {
      setMenuAcik(true);
      dokunmaBaslangici.current = null;
    }
  }

  function dokunmaBitti() {
    dokunmaBaslangici.current = null;
  }


  return (
    <div
      className="flex min-h-svh w-full"
      onTouchStart={dokunmaBasladi}
      onTouchMove={dokunmaHareketEtti}
      onTouchEnd={dokunmaBitti}
    >
      <div className="flex flex-1 flex-col overflow-y-auto print:contents">
        {/* Üst bar + 3 çizgi (hamburger) menü butonu + tema geçişi — her ekran boyutunda; yazdırmada gizli (uygulama navigasyonu, çıktının parçası değil) */}
        <header className="flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground print:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuAcik(true)}
              aria-label="Menüyü aç"
              className="flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <PanelLogo klinik={klinik} />
          </div>
          <ThemeToggle variant="inline" />
        </header>

        {children}
      </div>

      {/* Çekmece (drawer) — her ekran boyutunda */}
      {menuAcik && (
        <div className="fixed inset-0 z-50 print:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuAcik(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
              <p className="text-sm font-semibold">Menü</p>
              <button
                type="button"
                onClick={() => setMenuAcik(false)}
                aria-label="Menüyü kapat"
                className="rounded-lg p-1.5 transition-colors hover:bg-sidebar-accent"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <SidebarIcerik
              klinik={klinik}
              kullaniciAdi={kullaniciAdi}
              kullaniciRolu={kullaniciRolu}
              pathname={pathname}
              linkTiklandi={() => setMenuAcik(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
