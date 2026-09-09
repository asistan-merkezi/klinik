import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * docs/DESIGN.md tipografi ölçeği: başlık headline-lg/md, alt metin body-md
 * muted. Sağda aksiyon slotu, mobilde sarar (flex-wrap — projede zaten
 * yerleşik desen, bkz. panel/muhasebe/kamusal-giderler/page.tsx).
 *
 * `icon`: SADECE Server Component'ten (veya zaten client olan bir üst
 * bileşenden) doğrudan bir `LucideIcon` referansı geçirilmeli — bu bileşenin
 * kendisi "use client" DEĞİL, bir Server Component çağırabilir. Ama eğer bu
 * bileşen bir "use client" bileşenin İÇİNDEN, bir üst Server Component'ten
 * gelen `icon`'u devralarak render ediyorsa, o zaman fonksiyon zaten
 * server→client sınırını geçmiş demektir — CLAUDE.md'nin defalarca
 * belgelediği hata (bkz. Mesajlaşma modülü 500 hatası). Böyle bir durumda
 * ikon her zaman ÇAĞIRAN client bileşenin kendi dahili haritasından
 * çözülmeli, buraya asla server'dan iletilmemeli.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: string;
  /** Opsiyonel, başlığın solunda küçük bir ikon rozeti. */
  icon?: LucideIcon;
  /** Opsiyonel, örn. "Hastalar / Mehmet Yılmaz" gibi bir geri-link satırı. */
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          {breadcrumb && <div className="mb-1 text-sm text-muted-foreground">{breadcrumb}</div>}
          <h1 className="text-2xl leading-8 font-semibold tracking-tight text-foreground sm:text-[1.875rem] sm:leading-[2.375rem]">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
