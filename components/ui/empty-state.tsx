import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Tek satırlık, düşük yükseklikli görünüm — liste/kart içinde büyük boş alan istenmeyen yerlerde. */
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground",
          className
        )}
      >
        {Icon && <Icon className="size-4 shrink-0 opacity-50" aria-hidden />}
        <span>{title}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center",
        className
      )}
    >
      {Icon && <Icon className="size-8 text-muted-foreground opacity-40" aria-hidden />}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
