import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * input.tsx ile birebir aynı resting/focus/error tedavisi (docs/DESIGN.md §4).
 * Projede daha önce paylaşılan bir textarea bileşeni yoktu — sayfalar kendi
 * ham `<textarea>` elementlerini stilliyordu (Faz 2 kapsamı sadece
 * components/ui/*, o çağrı yerlerine bu turda dokunulmadı).
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/12 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
