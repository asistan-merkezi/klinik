import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";

type ModuleCardProps = {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  /** Verilirse ikon renkli bir IconTile içinde gösterilir (kategori vurgusu). */
  tone?: IconTileTone;
  /** subtitle metnini "Borç"/"Alacak" gibi durumlarda renklendirmek için. */
  subtitleTone?: "emerald" | "rose";
  warning?: boolean;
  /** Sağ üstte küçük durum noktası (warning ile aynı slotu paylaşır, warning true ise amber öncelikli). */
  dot?: "emerald" | "muted" | "sky";
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

const KART_SINIFI =
  "group flex h-full min-h-28 flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-white/10 dark:bg-card/70 dark:backdrop-blur-md";

export function ModuleCard({
  icon: Icon,
  label,
  subtitle,
  tone,
  subtitleTone,
  warning,
  dot,
  active,
  href,
  onClick,
  className,
  style,
}: ModuleCardProps) {
  const sinif = cn(
    KART_SINIFI,
    active && "border-primary/60 shadow-[0_0_0_1px_rgba(0,242,254,0.35),0_4px_20px_-4px_rgba(0,242,254,0.45)] dark:bg-card",
    className
  );

  const icerik = (
    <>
      <div className="flex w-full items-center justify-between">
        {tone ? (
          <IconTile icon={Icon} tone={tone} />
        ) : (
          <Icon
            className={cn("size-6 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-primary")}
            aria-hidden
          />
        )}
        {warning ? (
          <span className="size-2 rounded-full bg-amber-500" aria-label="Eksik bilgi" />
        ) : (
          dot && (
            <span
              className={cn(
                "size-2 rounded-full",
                dot === "emerald" && "bg-emerald-500",
                dot === "sky" && "bg-sky-500",
                dot === "muted" && "bg-muted-foreground/40"
              )}
              aria-hidden
            />
          )
        )}
      </div>
      <span className="text-sm font-medium text-card-foreground">{label}</span>
      {subtitle && (
        <span
          className={cn(
            "truncate text-xs",
            subtitleTone === "emerald" && "font-semibold tabular-nums text-emerald-600 dark:text-emerald-400",
            subtitleTone === "rose" && "font-semibold tabular-nums text-rose-600 dark:text-rose-400",
            !subtitleTone && "text-muted-foreground"
          )}
        >
          {subtitle}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={sinif} style={style}>
        {icerik}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sinif} style={style}>
      {icerik}
    </button>
  );
}
