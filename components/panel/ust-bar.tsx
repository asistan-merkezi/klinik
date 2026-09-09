"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Bell, CalendarDays, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cikisYap } from "@/app/(app)/panel/actions";

/**
 * Kalıcı üst bar (docs/DESIGN.md "Top Clinical Bar", 4.25rem). Global arama
 * için ayrı bir canlı-sonuç endpoint'i YOK — Enter'da/tıklamada mevcut
 * Hastalar listesinin `?q=` param'ına yönlendirir (bkz. hasta-arama-kutusu.tsx
 * ile aynı sözleşme). "Yeni Randevu" mevcut YeniRandevuDialog'un yaşadığı
 * /panel/randevular'a yönlendirir — dialog kendi veri bağımlılıklarıyla
 * (hasta/terapist/oda/cihaz/tedavi listeleri) orada zaten kurulu; bunları
 * her sayfada tekrar çekmemek için burada yeni bir dialog kurulmadı.
 */
export function UstBar({
  kullaniciAdi,
  kullaniciRolu,
  bildirimSayisi,
}: {
  kullaniciAdi: string;
  kullaniciRolu: string;
  bildirimSayisi?: number;
}) {
  const router = useRouter();
  const [aramaDegeri, setAramaDegeri] = useState("");
  const [mobilAramaAcik, setMobilAramaAcik] = useState(false);
  const mobilInputRef = useRef<HTMLInputElement>(null);

  function aramayaGit() {
    const deger = aramaDegeri.trim();
    router.push(deger ? `/panel/hastalar?q=${encodeURIComponent(deger)}` : "/panel/hastalar");
  }

  return (
    <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4 print:hidden">
      {mobilAramaAcik ? (
        <div className="flex flex-1 items-center gap-2 md:hidden">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={mobilInputRef}
            type="search"
            value={aramaDegeri}
            onChange={(e) => setAramaDegeri(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") aramayaGit();
              if (e.key === "Escape") setMobilAramaAcik(false);
            }}
            placeholder="Hasta adı, TC veya randevu ara..."
            className="h-9 flex-1 min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => setMobilAramaAcik(false)}>
            Vazgeç
          </Button>
        </div>
      ) : (
        <>
          {/* Global arama — desktop: tam input, mobil: sadece ikon buton */}
          <button
            type="button"
            onClick={() => {
              setMobilAramaAcik(true);
              requestAnimationFrame(() => mobilInputRef.current?.focus());
            }}
            aria-label="Hasta ara"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <Search className="size-4.5" aria-hidden />
          </button>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={aramaDegeri}
              onChange={(e) => setAramaDegeri(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aramayaGit()}
              placeholder="Hasta adı, TC veya randevu ara..."
              className="h-9 w-full rounded-md border border-input bg-input-bg pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex-1 md:hidden" />

          <Button
            type="button"
            size="sm"
            nativeButton={false}
            render={
              <Link href="/panel/randevular">
                <Plus />
                <span className="hidden sm:inline">Yeni Randevu</span>
              </Link>
            }
          />

          {bildirimSayisi !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative"
              nativeButton={false}
              render={
                <Link href="/panel/hastalar/bildirimler" aria-label="Bildirimler">
                  <Bell />
                  {bildirimSayisi > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                      {bildirimSayisi > 9 ? "9+" : bildirimSayisi}
                    </span>
                  )}
                </Link>
              }
            />
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={
              <Link href="/panel/randevular" aria-label="Randevu takvimi">
                <CalendarDays />
              </Link>
            }
          />

          <ThemeToggle variant="inline" />

          {/* Kullanıcı bloğu — native details/summary: yeni bir dropdown
              primitive'i eklemeden erişilebilir, klavyeyle çalışan bir menü. */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 [&::-webkit-details-marker]:hidden hover:bg-muted">
              <Avatar name={kullaniciAdi} size="sm" />
              <span className="hidden text-left lg:block">
                <span className="block max-w-32 truncate text-sm font-medium text-foreground">{kullaniciAdi}</span>
                <span className="block max-w-32 truncate text-xs text-muted-foreground">{kullaniciRolu}</span>
              </span>
              <ChevronDown className="hidden size-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden />
            </summary>
            <div className="absolute top-full right-0 z-40 mt-1.5 w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-z2">
              <div className="border-b border-border px-2 py-1.5 lg:hidden">
                <p className="truncate text-sm font-medium">{kullaniciAdi}</p>
                <p className="truncate text-xs text-muted-foreground">{kullaniciRolu}</p>
              </div>
              <form action={cikisYap}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                >
                  <LogOut className="size-4" aria-hidden />
                  Çıkış yap
                </button>
              </form>
            </div>
          </details>
        </>
      )}
    </header>
  );
}
