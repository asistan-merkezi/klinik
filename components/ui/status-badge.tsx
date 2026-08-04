import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "emerald" | "amber" | "rose" | "sky" | "slate" | "primary";

const TONE_SINIFLARI: Record<StatusTone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  slate: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
};

export function StatusBadge({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone: StatusTone }) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONE_SINIFLARI[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
