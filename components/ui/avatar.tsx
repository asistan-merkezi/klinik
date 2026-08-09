import { cn } from "@/lib/utils";
import { baslangicHarfleriAl, renkUret } from "@/lib/avatar";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border/70 font-semibold",
        size === "sm" ? "size-9 text-xs" : "size-11 text-sm",
        renkUret(name),
        className
      )}
      aria-hidden
    >
      {baslangicHarfleriAl(name)}
    </div>
  );
}
