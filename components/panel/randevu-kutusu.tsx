import { memo } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";

export type GorunumDurumu = "planlandi" | "geldi" | "seansta" | "tamamlandi" | "iptal" | "gelmedi";

/** Randevunun ekrandaki durumu DB durumundan + saatten türetilir, elle girilmez. */
export function gorunumDurumuHesapla(randevu: RandevuSatir, simdi: Date): GorunumDurumu {
  if (randevu.durum === "iptal" || randevu.durum === "gelmedi") return randevu.durum;
  const bitis = new Date(randevu.bitis);
  if (simdi >= bitis) return "tamamlandi";
  const baslangic = new Date(randevu.baslangic);
  if (randevu.durum === "geldi" && simdi >= baslangic) return "seansta";
  return randevu.durum;
}

const DURUM_STIL: Record<
  GorunumDurumu,
  { etiket: string; rozet: string; kart: string; serit: string; adSinif?: string }
> = {
  planlandi: {
    etiket: "Planlandı",
    rozet: "bg-muted text-muted-foreground",
    kart: "border-border bg-card",
    serit: "bg-border",
  },
  geldi: {
    etiket: "Geldi",
    rozet: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    kart: "border-border bg-card",
    serit: "bg-emerald-500",
  },
  seansta: {
    etiket: "Seansta",
    rozet: "bg-primary/10 text-primary",
    kart: "border-primary bg-primary/5",
    serit: "bg-primary",
  },
  tamamlandi: {
    etiket: "Tamamlandı",
    rozet: "bg-muted text-muted-foreground",
    kart: "border-border bg-muted/30 opacity-50",
    serit: "bg-muted-foreground/30",
  },
  iptal: {
    etiket: "İptal",
    rozet: "bg-destructive/10 text-destructive",
    kart: "border-destructive/30 bg-destructive/5 opacity-70",
    serit: "bg-destructive",
    adSinif: "text-muted-foreground line-through",
  },
  gelmedi: {
    etiket: "Gelmedi",
    rozet: "bg-destructive/10 text-destructive",
    kart: "border-destructive/30 bg-destructive/5 opacity-70",
    serit: "bg-destructive",
    adSinif: "text-muted-foreground line-through",
  },
};

type RandevuKutusuProps = {
  randevu: RandevuSatir;
  gorunumDurumu: GorunumDurumu;
  className?: string;
};

export const RandevuKutusu = memo(function RandevuKutusu({
  randevu,
  gorunumDurumu,
  className,
}: RandevuKutusuProps) {
  const stil = DURUM_STIL[gorunumDurumu];

  return (
    <article
      id={`randevu-${randevu.id}`}
      className={cn(
        "relative h-full overflow-hidden rounded-xl border p-3 pl-4 transition-colors",
        stil.kart,
        className
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", stil.serit)} aria-hidden />

      <div className="flex items-start justify-between gap-2">
        <p className={cn("truncate text-sm font-semibold text-foreground", stil.adSinif)}>
          {randevu.musteri?.ad_soyad ?? "—"}
          <span className="tabular-nums ml-2 font-mono text-xs font-normal text-muted-foreground">
            {formatTime(randevu.baslangic)}
          </span>
        </p>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-tight",
            stil.rozet
          )}
        >
          {gorunumDurumu === "seansta" && (
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
          )}
          {stil.etiket}
        </span>
      </div>

      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {randevu.terapist?.personel?.ad_soyad ?? "—"}
        <span> · {randevu.oda?.ad ?? "—"}</span>
      </p>
    </article>
  );
});
