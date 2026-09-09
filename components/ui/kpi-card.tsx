import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";

/**
 * docs/DESIGN.md "KPI kartları" (Panel ana ekran referansı) — etiket
 * (label-sm uppercase muted), büyük sayı (display-lg, tabular), opsiyonel
 * alt satır (trend/ilerleme), sağ üst ikon rozeti. Yeni bileşen — henüz
 * hiçbir sayfa kullanmıyor (Faz 3'te Panel ana ekranına bağlanacak).
 * `value` null/undefined ise gerçek veri kaynağı yoksa "—" gösterilir —
 * kartın kendisi UYDURMA sayı basmaz, çağıran taraf veri yoksa değeri
 * boş bırakır.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  iconTone = "blue",
  trend,
  className,
}: {
  label: string;
  /** Zaten formatlanmış gösterim değeri (₺, %, adet vb. çağıran tarafta formatlanır). null/undefined → "—". */
  value: React.ReactNode | null | undefined;
  icon?: LucideIcon;
  iconTone?: IconTileTone;
  /** Alt satır — trend metni, ilerleme çubuğu veya kırılım. */
  trend?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-3", className)}>
      <div className="flex items-start justify-between px-(--card-spacing)">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        {Icon && <IconTile icon={Icon} tone={iconTone} className="size-8 rounded-lg" />}
      </div>
      <div className="px-(--card-spacing)">
        <p className="text-[1.75rem] leading-9 font-bold tabular-nums text-foreground">
          {value === null || value === undefined || value === "" ? "—" : value}
        </p>
        {trend && <div className="mt-1 text-xs text-muted-foreground">{trend}</div>}
      </div>
    </Card>
  );
}
