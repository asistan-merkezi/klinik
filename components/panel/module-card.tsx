import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ModuleCardProps = {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  warning?: boolean;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
};

const KART_SINIFI =
  "group flex min-h-28 flex-col items-start gap-2 rounded-2xl border p-4 text-left backdrop-blur-md transition-all hover:border-primary/40 hover:bg-card active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function ModuleCard({ icon: Icon, label, subtitle, warning, active, href, onClick, className }: ModuleCardProps) {
  const sinif = cn(
    KART_SINIFI,
    active ? "border-primary/60 bg-card shadow-[0_0_0_1px_rgba(0,242,254,0.35),0_4px_20px_-4px_rgba(0,242,254,0.45)]" : "border-white/10 bg-card/70",
    className
  );

  const icerik = (
    <>
      <div className="flex w-full items-center justify-between">
        <Icon
          className={cn("size-6 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-primary")}
          aria-hidden
        />
        {warning && <span className="size-2 rounded-full bg-amber-500" aria-label="Eksik bilgi" />}
      </div>
      <span className="text-sm font-medium text-card-foreground">{label}</span>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={sinif}>
        {icerik}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={sinif}>
      {icerik}
    </button>
  );
}
