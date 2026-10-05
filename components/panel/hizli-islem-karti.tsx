import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile } from "@/components/ui/icon-tile";

/** Ana ekran "Hızlı Resepsiyon İşlemleri" kartı: ikon kutusu + etiket. */
export function HizliIslemKarti({
  icon,
  etiket,
  ...props
}: { icon: LucideIcon; etiket: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex w-44 flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <IconTile icon={icon} tone="emerald" className="size-12" />
      {etiket}
    </button>
  );
}
