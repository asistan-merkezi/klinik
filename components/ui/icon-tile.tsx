import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconTileTone = "blue" | "cyan" | "emerald" | "amber" | "violet" | "sky";

const TONE_SINIFLARI: Record<IconTileTone, string> = {
  blue: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
  cyan: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400",
  emerald: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-500 dark:text-sky-400",
};

export function IconTile({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon;
  tone: IconTileTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        TONE_SINIFLARI[tone],
        className
      )}
    >
      <Icon className="size-5" aria-hidden />
    </div>
  );
}
