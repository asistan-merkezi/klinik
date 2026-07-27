"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Giriş ekranları (app/(app)/giris, app/(app)/portal/giris) ve tablet kiosk
 * ekranı zaten sabit koyu temada — orada geçiş yapılabilir bir şey yok,
 * bu yüzden toggle o rotalarda hiç render edilmez.
 */
const GIZLI_ROTALAR = ["/giris", "/portal/giris"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (GIZLI_ROTALAR.some((rota) => pathname?.startsWith(rota)) || pathname?.includes("/tablet/")) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="fixed right-4 bottom-4 z-50 rounded-full shadow-lg"
      aria-label={mounted && theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
