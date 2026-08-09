"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Giriş ekranları (app/(app)/giris, app/(app)/portal/giris) ve tablet kiosk
 * ekranı zaten sabit koyu temada — orada geçiş yapılabilir bir şey yok,
 * bu yüzden toggle o rotalarda hiç render edilmez. /panel/* rotaları da
 * dahil edildi: PanelSidebar'ın mobil header'ı artık kendi inline toggle'ını
 * gösteriyor, kök seviyedeki FAB oraya bindirmesin diye "fab" varyantı
 * /panel altında render edilmiyor (inline varyant zaten sadece sidebar'dan
 * çağrılıyor, bu kontrolden etkilenmez). /tablet-onizleme (auth'suz QA
 * rotası) da tablet ekranının kendi tema seçiciyle yönetildiği için dahil.
 */
const GIZLI_ROTALAR = ["/giris", "/portal/giris", "/tablet-onizleme"];

export function ThemeToggle({ variant = "fab" }: { variant?: "fab" | "inline" }) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const gizliRotada = GIZLI_ROTALAR.some((rota) => pathname?.startsWith(rota)) || pathname?.includes("/tablet/");
  if (gizliRotada) return null;
  if (variant === "fab" && pathname?.startsWith("/panel")) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        variant === "fab" && "fixed right-4 bottom-4 z-50 rounded-full shadow-lg",
        variant === "inline" && "h-11 w-11 rounded-full"
      )}
      aria-label={mounted && theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
