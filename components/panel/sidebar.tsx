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
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cikisYap } from "@/app/(app)/panel/actions";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { PanelLogo } from "@/components/panel/panel-logo";
import { UstBar } from "@/components/panel/ust-bar";
import { Avatar } from "@/components/ui/avatar";
import type { Klinik } from "@/types/klinik";

const ANA_OGELER = [
  { href: "/panel", label: "Ana Ekran", icon: Home, tamEslesme: true },
  { href: "/panel/hastalar", label: "Hastalar", icon: Users },
  { href: "/panel/personel", label: "Personel", icon: UserCog },
  { href: "/panel/randevular", label: "Randevular", icon: CalendarDays },
  { href: "/panel/paketler", label: "Paketler", icon: Package },
  { href: "/panel/kaynaklar", label: "Donanım", icon: DoorOpen },
];

const BOTTOM_NAV_OGELERI = [
  { href: "/panel", label: "Panel", icon: Home, tamEslesme: true },
  { href: "/panel/randevular", label: "Randevu", icon: CalendarDays },
  { href: "/panel/hastalar", label: "Hastalar", icon: Users },
];

const PLAN_ETIKETLERI: Record<string, string> = {
  starter: "Başlangıç",
  pro: "Pro",
  enterprise: "Kurumsal",
};

function girdiAktifMi(pathname: string, href: string, tamEslesme?: boolean) {
  if (tamEslesme) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tek satırlık nav linki — hem gerçek `<aside>` (md–xl arası ikon-rail,
 * xl+ tam genişlik, tamamen CSS ile) hem de mobil çekmece (`tamGenislikZorla`,
 * gerçek viewport dar olsa bile her zaman tam görünüm) tarafından paylaşılır.
 * Rail modunda (md..xl) etiket hover/focus'ta yüzen bir tooltip'e dönüşür.
 */
function SidebarLink({
  href,
  label,
  icon: Icon,
  aktif,
  tamGenislikZorla,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  aktif: boolean;
  tamGenislikZorla?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group/navlink relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        tamGenislikZorla ? "justify-start" : "justify-center xl:justify-start",
        aktif
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      )}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden />
      <span className={cn(tamGenislikZorla ? "inline" : "hidden xl:inline")}>{label}</span>
      {!tamGenislikZorla && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-2 rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-z2 transition-opacity group-hover/navlink:opacity-100 group-focus-visible/navlink:opacity-100 xl:hidden"
        >
          {label}
        </span>
      )}
    </Link>
  );
}

function SidebarGovde({
  klinik,
  klinikPlani,
  kullaniciAdi,
  kullaniciRolu,
  pathname,
  tamGenislikZorla,
  linkTiklandi,
}: {
  klinik: Klinik;
  klinikPlani: string | null;
  kullaniciAdi: string;
  kullaniciRolu: string;
  pathname: string;
  tamGenislikZorla?: boolean;
  linkTiklandi?: () => void;
}) {
  return (
    <>
      {/* Marka bloğu */}
      <Link
        href="/panel"
        onClick={linkTiklandi}
        className={cn(
          "flex items-center gap-2 border-b border-sidebar-border px-4 py-4",
          !tamGenislikZorla && "justify-center xl:justify-start"
        )}
      >
        <PanelLogo klinik={klinik} />
        <div className={cn("min-w-0", tamGenislikZorla ? "block" : "hidden xl:block")}>
          <p className="truncate text-sm font-semibold text-sidebar-foreground">Klinik Asistanı</p>
          <p className="truncate text-xs text-muted-foreground">{klinik.ad}</p>
        </div>
      </Link>

      {/* Klinik/şube değiştirici kartı — şube kavramı veri modelinde yok
          (bkz. CLAUDE.md: çoklu şube ertelendi), bu yüzden dropdown/chevron
          YOK, sadece bilgi kartı. */}
      <div className={cn("px-3 pt-3", tamGenislikZorla ? "block" : "hidden xl:block")}>
        <div className="rounded-md border border-sidebar-border bg-card p-3">
          <p className="truncate text-sm font-medium text-card-foreground">{klinik.ad}</p>
          {klinikPlani && (
            <span className="mt-1.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
              {PLAN_ETIKETLERI[klinikPlani] ?? klinikPlani}
            </span>
          )}
        </div>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto p-3",
          !tamGenislikZorla && "items-center xl:items-stretch"
        )}
      >
        {ANA_OGELER.map((oge) => (
          <SidebarLink
            key={oge.href}
            href={oge.href}
            label={oge.label}
            icon={oge.icon}
            aktif={girdiAktifMi(pathname, oge.href, oge.tamEslesme)}
            tamGenislikZorla={tamGenislikZorla}
            onClick={linkTiklandi}
          />
        ))}

        {MENU_GRUPLARI.map((grup) => {
          const grupHref = `/panel/${grup.key}`;
          const grupAktif =
            girdiAktifMi(pathname, grupHref) || grup.ogeler.some((o) => girdiAktifMi(pathname, o.href));

          return (
            <SidebarLink
              key={grup.key}
              href={grupHref}
              label={grup.label}
              icon={grup.icon}
              aktif={grupAktif}
              tamGenislikZorla={tamGenislikZorla}
              onClick={linkTiklandi}
            />
          );
        })}
      </nav>

      {/* Klinik Destek Hattı */}
      <div className={cn("border-t border-sidebar-border p-3", !tamGenislikZorla && "flex justify-center xl:block")}>
        <Link
          href="/panel/destek"
          onClick={linkTiklandi}
          title="Klinik Destek Hattı"
          className={cn(
            "group/destek relative flex items-center gap-2 rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            tamGenislikZorla
              ? "bg-muted p-3 text-foreground hover:text-foreground"
              : "size-10 justify-center xl:size-auto xl:w-full xl:justify-start xl:bg-muted xl:p-3 xl:text-foreground xl:hover:text-foreground"
          )}
        >
          <LifeBuoy className="size-4.5 shrink-0" aria-hidden />
          <div className={cn(tamGenislikZorla ? "block" : "hidden xl:block")}>
            <p className="text-sm font-semibold">Klinik Destek Hattı</p>
            <p className="text-xs text-muted-foreground">Sorularınız için buradayız.</p>
          </div>
          {!tamGenislikZorla && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-2 rounded-md bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-z2 transition-opacity group-hover/destek:opacity-100 group-focus-visible/destek:opacity-100 xl:hidden"
            >
              Klinik Destek Hattı
            </span>
          )}
        </Link>
      </div>

      {/* Kullanıcı satırı + çıkış */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-sidebar-border p-3",
          !tamGenislikZorla && "flex-col xl:flex-row"
        )}
      >
        <Avatar name={kullaniciAdi} size="sm" />
        <div className={cn("min-w-0 flex-1", tamGenislikZorla ? "block" : "hidden xl:block")}>
          <p className="truncate text-sm font-medium text-sidebar-foreground">{kullaniciAdi}</p>
          <p className="truncate text-xs text-muted-foreground">{kullaniciRolu}</p>
        </div>
        <form action={cikisYap}>
          <button
            type="submit"
            title="Çıkış yap"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
          </button>
        </form>
      </div>
    </>
  );
}

export function PanelSidebar({
  klinik,
  klinikPlani,
  kullaniciAdi,
  kullaniciRolu,
  bildirimSayisi,
  children,
}: {
  klinik: Klinik;
  klinikPlani: string | null;
  kullaniciAdi: string;
  kullaniciRolu: string;
  bildirimSayisi?: number;
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
      className="flex min-h-svh w-full bg-background"
      onTouchStart={dokunmaBasladi}
      onTouchMove={dokunmaHareketEtti}
      onTouchEnd={dokunmaBitti}
    >
      {/* ≥768px: kalıcı sidebar — 768-1279 ikon-rail, ≥1280 tam genişlik (docs/DESIGN.md Layout & Spacing) */}
      <aside className="hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:w-rail xl:w-sidebar print:hidden">
        <SidebarGovde
          klinik={klinik}
          klinikPlani={klinikPlani}
          kullaniciAdi={kullaniciAdi}
          kullaniciRolu={kullaniciRolu}
          pathname={pathname}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:contents">
        <UstBar
          kullaniciAdi={kullaniciAdi}
          kullaniciRolu={kullaniciRolu}
          bildirimSayisi={bildirimSayisi}
        />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>

      {/* <768px: alt navigasyon */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden print:hidden"
        aria-label="Alt gezinme"
      >
        {BOTTOM_NAV_OGELERI.map((oge) => {
          const aktif = girdiAktifMi(pathname, oge.href, oge.tamEslesme);
          return (
            <Link
              key={oge.href}
              href={oge.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                aktif ? "text-primary" : "text-muted-foreground"
              )}
            >
              <oge.icon className="size-5" aria-hidden />
              {oge.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuAcik(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="size-5" aria-hidden />
          Menü
        </button>
      </nav>

      {/* Mobil çekmece ("Menü") — masaüstü sidebar ile aynı içerik, tam genişlik zorlanır */}
      {menuAcik && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          <div
            className="absolute inset-0 bg-[var(--elevation-backdrop)] backdrop-blur-sm"
            onClick={() => setMenuAcik(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-z3">
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
            <SidebarGovde
              klinik={klinik}
              klinikPlani={klinikPlani}
              kullaniciAdi={kullaniciAdi}
              kullaniciRolu={kullaniciRolu}
              pathname={pathname}
              tamGenislikZorla
              linkTiklandi={() => setMenuAcik(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
