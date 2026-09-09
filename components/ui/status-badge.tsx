import * as React from "react";
import { cn } from "@/lib/utils";
import { DURUM_TONU_SINIFLARI, DURUM_NABIZ_RENGI, type StatusTone } from "@/lib/ui/durum-tonlari";

export type { StatusTone };

export function StatusBadge({
  tone,
  pulse = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone: StatusTone;
  /** docs/DESIGN.md "Seans Başladı" — 6px nabız atan nokta (canlı/aktif durum). */
  pulse?: boolean;
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
        DURUM_TONU_SINIFLARI[tone],
        className
      )}
      {...props}
    >
      {pulse && (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", DURUM_NABIZ_RENGI)} />
          <span className={cn("relative inline-flex size-1.5 rounded-full", DURUM_NABIZ_RENGI)} />
        </span>
      )}
      {children}
    </span>
  );
}
