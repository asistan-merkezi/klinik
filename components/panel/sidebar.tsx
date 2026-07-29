"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  CalendarDays,
  ClipboardList,
  Package,
  DoorOpen,
  Wallet,
  Settings,
  LogOut,
  ChevronDown,
  UserCog,
  Receipt,
  Landmark,
  TrendingDown,
  MessageCircle,
  Tablet,
  ShieldCheck,
  RefreshCw,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cikisYap } from "@/app/(app)/panel/actions";

const ANA_OGELER = [
  { href: "/panel", label: "Ana Ekran", icon: Home, tamEslesme: true },
  { href: "/panel/musteriler", label: "Müşteriler", icon: Users },
  { href: "/panel/randevular", label: "Randevular", icon: CalendarDays },
  { href: "/panel/paketler", label: "Paketler", icon: Package },
  { href: "/panel/islemler", label: "Tedaviler", icon: ClipboardList },
  { href: "/panel/kaynaklar", label: "Donanım", icon: DoorOpen },
];

const GRUPLAR = [
  {
    key: "muhasebe",
    label: "Muhasebe",
    icon: Wallet,
    ogeler: [
      { href: "/panel/personel", label: "Personel", icon: UserCog },
      { href: "/panel/muhasebe/faturalar", label: "Faturalar", icon: Receipt },
      { href: "/panel/muhasebe/kamusal-giderler", label: "Kamusal Giderler", icon: Landmark },
      { href: "/panel/muhasebe/giderler", label: "Giderler", icon: TrendingDown },
    ],
  },
  {
    key: "ayarlar",
    label: "Ayarlar",
    icon: Settings,
    ogeler: [
      { href: "/panel/ayarlar/sirket-bilgileri", label: "Şirket Bilgileri", icon: Building2 },
      { href: "/panel/ayarlar/muhasebe-sync", label: "Muhasebe Sync", icon: RefreshCw },
      { href: "/panel/ayarlar/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/panel/tablet", label: "Tablet", icon: Tablet },
      { href: "/panel/ayarlar/yetkilendirme", label: "Yetkilendirme", icon: ShieldCheck },
    ],
  },
];

function girdiAktifMi(pathname: string, href: string, tamEslesme?: boolean) {
  if (tamEslesme) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarIcerik({
  kullaniciAdi,
  kullaniciRolu,
  pathname,
  acikGruplar,
  grubuAcKapat,
  linkTiklandi,
}: {
  kullaniciAdi: string;
  kullaniciRolu: string;
  pathname: string;
  acikGruplar: Set<string>;
  grubuAcKapat: (key: string) => void;
  linkTiklandi?: () => void;
}) {
  return (
    <>
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-sm font-semibold">Klinik Asistanı</p>
        <p className="truncate text-xs text-muted-foreground">
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

        {GRUPLAR.map((grup) => {
          const acik = acikGruplar.has(grup.key);
          const grupAktif = grup.ogeler.some((o) => girdiAktifMi(pathname, o.href));

          return (
            <div key={grup.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => grubuAcKapat(grup.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  grupAktif ? "text-sidebar-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <grup.icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left">{grup.label}</span>
                <ChevronDown
                  className={cn("size-3.5 shrink-0 transition-transform", acik && "rotate-180")}
                  aria-hidden
                />
              </button>

              {acik && (
                <div className="ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                  {grup.ogeler.map((oge) => (
                    <Link
                      key={oge.href}
                      href={oge.href}
                      onClick={linkTiklandi}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                        girdiAktifMi(pathname, oge.href)
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <oge.icon className="size-3.5 shrink-0" aria-hidden />
                      {oge.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <form action={cikisYap} className="border-t border-sidebar-border p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Çıkış yap
        </button>
      </form>
    </>
  );
}

export function PanelSidebar({
  kullaniciAdi,
  kullaniciRolu,
  children,
}: {
  kullaniciAdi: string;
  kullaniciRolu: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuAcik, setMenuAcik] = useState(false);
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(
    () => new Set(GRUPLAR.filter((g) => g.ogeler.some((o) => girdiAktifMi(pathname, o.href))).map((g) => g.key))
  );
  const dokunmaBaslangici = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMenuAcik(false);
  }, [pathname]);

  function dokunmaBasladi(e: React.TouchEvent) {
    if (menuAcik || window.matchMedia("(min-width: 1024px)").matches) return;
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

  function grubuAcKapat(key: string) {
    setAcikGruplar((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(key)) {
        yeni.delete(key);
      } else {
        yeni.add(key);
      }
      return yeni;
    });
  }

  return (
    <div
      className="flex min-h-svh w-full"
      onTouchStart={dokunmaBasladi}
      onTouchMove={dokunmaHareketEtti}
      onTouchEnd={dokunmaBitti}
    >
      {/* Masaüstü: sabit sidebar */}
      <aside className="hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarIcerik
          kullaniciAdi={kullaniciAdi}
          kullaniciRolu={kullaniciRolu}
          pathname={pathname}
          acikGruplar={acikGruplar}
          grubuAcKapat={grubuAcKapat}
        />
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Mobil: üst bar + 3 çizgi (hamburger) menü butonu */}
        <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAcik(true)}
            aria-label="Menüyü aç"
            className="rounded-lg p-1.5 transition-colors hover:bg-sidebar-accent"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <p className="text-sm font-semibold">Klinik Asistanı</p>
        </header>

        {children}
      </div>

      {/* Mobil: çekmece (drawer) */}
      {menuAcik && (
        <div className="fixed inset-0 z-50 lg:hidden">
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
              kullaniciAdi={kullaniciAdi}
              kullaniciRolu={kullaniciRolu}
              pathname={pathname}
              acikGruplar={acikGruplar}
              grubuAcKapat={grubuAcKapat}
              linkTiklandi={() => setMenuAcik(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
