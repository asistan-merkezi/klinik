"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cikisYap } from "@/app/(app)/panel/actions";

const ANA_OGELER = [
  { href: "/panel/musteriler", label: "Müşteriler", icon: Users },
  { href: "/panel/randevular", label: "Randevular", icon: CalendarDays },
  { href: "/panel/islemler", label: "İşlemler", icon: ClipboardList },
  { href: "/panel/paketler", label: "Paketler", icon: Package },
  { href: "/panel/kaynaklar", label: "Kaynaklar", icon: DoorOpen },
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

function girdiAktifMi(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PanelSidebar({
  kullaniciAdi,
  kullaniciRolu,
}: {
  kullaniciAdi: string;
  kullaniciRolu: string;
}) {
  const pathname = usePathname();
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(
    () => new Set(GRUPLAR.filter((g) => g.ogeler.some((o) => girdiAktifMi(pathname, o.href))).map((g) => g.key))
  );

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
    <aside className="flex h-svh w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-4">
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
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              girdiAktifMi(pathname, oge.href)
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
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
                  grupAktif ? "text-foreground" : "text-foreground hover:bg-muted"
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
                <div className="ml-4 flex flex-col gap-0.5 border-l border-border pl-3">
                  {grup.ogeler.map((oge) => (
                    <Link
                      key={oge.href}
                      href={oge.href}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                        girdiAktifMi(pathname, oge.href)
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
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

      <form action={cikisYap} className="border-t border-border p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Çıkış yap
        </button>
      </form>
    </aside>
  );
}
