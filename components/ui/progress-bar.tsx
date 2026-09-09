import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * docs/DESIGN.md "Progress Bar (Teal indicator)" — dolgu --clinical-accent
 * (Teal 600, metin taşımayan accent rolü), track --muted. Yeni bileşen —
 * henüz hiçbir sayfa kullanmıyor.
 */
export function ProgressBar({
  value,
  max = 100,
  showLabel = false,
  className,
}: {
  /** 0-max arası; max'tan büyük/küçük değerler kırpılır. */
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const yuzde = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-1.5 w-full flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-clinical-accent transition-[width] duration-300"
          style={{ width: `${yuzde}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-medium tabular-nums text-muted-foreground">%{Math.round(yuzde)}</span>}
    </div>
  );
}
