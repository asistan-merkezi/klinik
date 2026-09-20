"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  CalendarDays,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cikisYap } from "@/app/(app)/panel/actions";
import { MENU_GRUPLARI } from "@/lib/panel/menu-gruplari";
import { canAccessModule, moduleKeyForRoute } from "@/lib/auth/roles";
import { PanelLogo } from "@/components/panel/panel-logo";
import { UstBar } from "@/components/panel/ust-bar";
import { Avatar } from "@/components/ui/avatar";
import type { Klinik } from "@/types/klinik";

const ANA_OGELER = [
  { key: "ana_ekran", href: "/panel", label: "Ana Ekran", icon: Home, tamEslesme: true },
  { key: "hastalar", href: "/panel/hastalar", label: "Hastalar", icon: Users },
  { key: "randevular", href: "/panel/randevular", label: "Randevular", icon: CalendarDays },
];

// Sidebar'daki üst seviye linklerin (Ana Ekran/Hastalar/Randevular +
// MENU_GRUPLARI'ndaki Finans/Yönetim/Ayarlar) görünürlüğü lib/auth/roles.ts'teki
// MODULE_TREE/canAccessModule'den geliyor (Pozisyon şablonu + kullanıcı
// override, bkz. Ayarlar > Yetkilendirme) — `allowedModules` prop'uyla buraya
// geliyor (bkz. app/(app)/panel/layout.tsx). Bir grup için doğrudan izin
// olmasa bile en az bir alt öğeye erişim varsa grup görünür kalır (Partial
// Visibility) — hangi alt öğelerin gerçekten göründüğü grubun kendi hub
// sayfasında (MenuGrubuSayfasi) ayrıca süzülür. "Destek" bu listede hiç yok,
// her zaman açık (canAccessModule özel durumu).

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

/** Tek satırlık nav linki — çekmece (her zaman tam genişlik) tarafından kullanılır. */
function SidebarLink({
  href,
  label,
  icon: Icon,
  aktif,
  onClick,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  aktif: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        aktif
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      )}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function SidebarGovde({
  klinik,
  klinikPlani,
  kullaniciAdi,
  kullaniciRolu,
  allowedModules,
  pathname,
  linkTiklandi,
}: {
  klinik: Klinik;
  klinikPlani: string | null;
  kullaniciAdi: string;
  kullaniciRolu: string;
  allowedModules: string[];
  pathname: string;
  linkTiklandi?: () => void;
}) {
  return (
    <>
      {/* Marka bloğu */}
      <Link
        href="/panel"
        onClick={linkTiklandi}
        className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4"
      >
        <PanelLogo klinik={klinik} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">Klinik Asistanı</p>
          <p className="truncate text-xs text-muted-foreground">{klinik.ad}</p>
        </div>
      </Link>

      {/* Klinik/şube değiştirici kartı — şube kavramı veri modelinde yok
          (bkz. CLAUDE.md: çoklu şube ertelendi), bu yüzden dropdown/chevron
          YOK, sadece bilgi kartı. */}
      <div className="px-3 pt-3">
        <div className="rounded-md border border-sidebar-border bg-card p-3">
          <p className="truncate text-sm font-medium text-card-foreground">{klinik.ad}</p>
          {klinikPlani && (
            <span className="mt-1.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
              {PLAN_ETIKETLERI[klinikPlani] ?? klinikPlani}
            </span>
          )}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {ANA_OGELER.filter((oge) => canAccessModule(allowedModules, oge.key)).map((oge) => (
          <SidebarLink
            key={oge.href}
            href={oge.href}
            label={oge.label}
            icon={oge.icon}
            aktif={girdiAktifMi(pathname, oge.href, oge.tamEslesme)}
            onClick={linkTiklandi}
          />
        ))}

        {MENU_GRUPLARI.filter(
          (grup) =>
            canAccessModule(allowedModules, grup.key) ||
            grup.ogeler.some((oge) => canAccessModule(allowedModules, moduleKeyForRoute(oge.href) ?? grup.key))
        ).map((grup) => {
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
              onClick={linkTiklandi}
            />
          );
        })}
      </nav>

      {/* Kullanıcı satırı + çıkış */}
      <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
        <Avatar name={kullaniciAdi} size="sm" />
        <div className="min-w-0 flex-1">
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
  allowedModules,
  bildirimSayisi,
  children,
}: {
  klinik: Klinik;
  klinikPlani: string | null;
  kullaniciAdi: string;
  kullaniciRolu: string;
  allowedModules: string[];
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
      className="flex h-svh w-full overflow-hidden bg-background"
      onTouchStart={dokunmaBasladi}
      onTouchMove={dokunmaHareketEtti}
      onTouchEnd={dokunmaBitti}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col print:contents">
        <UstBar
          kullaniciAdi={kullaniciAdi}
          kullaniciRolu={kullaniciRolu}
          bildirimSayisi={bildirimSayisi}
          onMenuAc={() => setMenuAcik(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
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

      {/* Çekmece ("Menü") — artık tüm genişliklerde tek gezinme yolu, hep tam genişlik zorlanır */}
      {menuAcik && (
        <div className="fixed inset-0 z-50 print:hidden">
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
              allowedModules={allowedModules}
              pathname={pathname}
              linkTiklandi={() => setMenuAcik(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
