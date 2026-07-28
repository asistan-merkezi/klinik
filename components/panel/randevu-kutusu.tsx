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
  { etiket: string; rozet: string; adSinif?: string; soluk?: boolean; vurgu?: string }
> = {
  planlandi: { etiket: "Planlandı", rozet: "bg-muted text-muted-foreground" },
  geldi: { etiket: "Geldi", rozet: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  seansta: {
    etiket: "Seansta",
    rozet: "bg-primary/10 text-primary",
    vurgu: "ring-2 ring-primary ring-offset-1 ring-offset-background",
  },
  tamamlandi: { etiket: "Tamamlandı", rozet: "bg-muted text-muted-foreground", soluk: true },
  iptal: {
    etiket: "İptal",
    rozet: "bg-destructive/10 text-destructive",
    adSinif: "line-through",
    soluk: true,
  },
  gelmedi: {
    etiket: "Gelmedi",
    rozet: "bg-destructive/10 text-destructive",
    adSinif: "line-through",
    soluk: true,
  },
};

// Tedavi (islem_tanimi) başına sabit, tutarlı bir renk — id'den türetilir,
// elle renk seçimi/ekstra alan gerekmez. Sınıflar tam literal yazılır
// (şablon string ile üretilmez), yoksa Tailwind'in statik taraması bunları
// göremez ve stil hiç üretilmez.
const TEDAVI_PALETI = [
  { serit: "bg-blue-500", dolgu: "bg-blue-500/10", kenar: "border-blue-300 dark:border-blue-500/40" },
  { serit: "bg-violet-500", dolgu: "bg-violet-500/10", kenar: "border-violet-300 dark:border-violet-500/40" },
  { serit: "bg-amber-500", dolgu: "bg-amber-500/10", kenar: "border-amber-300 dark:border-amber-500/40" },
  { serit: "bg-rose-500", dolgu: "bg-rose-500/10", kenar: "border-rose-300 dark:border-rose-500/40" },
  { serit: "bg-teal-500", dolgu: "bg-teal-500/10", kenar: "border-teal-300 dark:border-teal-500/40" },
  { serit: "bg-indigo-500", dolgu: "bg-indigo-500/10", kenar: "border-indigo-300 dark:border-indigo-500/40" },
  { serit: "bg-orange-500", dolgu: "bg-orange-500/10", kenar: "border-orange-300 dark:border-orange-500/40" },
  { serit: "bg-fuchsia-500", dolgu: "bg-fuchsia-500/10", kenar: "border-fuchsia-300 dark:border-fuchsia-500/40" },
  { serit: "bg-cyan-500", dolgu: "bg-cyan-500/10", kenar: "border-cyan-300 dark:border-cyan-500/40" },
  { serit: "bg-lime-500", dolgu: "bg-lime-500/10", kenar: "border-lime-300 dark:border-lime-500/40" },
] as const;

const TEDAVI_NOTR = { serit: "bg-muted-foreground/40", dolgu: "bg-muted/40", kenar: "border-border" };

export function tedaviRengi(islemTanimiId: string | undefined | null) {
  if (!islemTanimiId) return TEDAVI_NOTR;
  let toplam = 0;
  for (let i = 0; i < islemTanimiId.length; i++) {
    toplam = (toplam + islemTanimiId.charCodeAt(i)) % 9973;
  }
  return TEDAVI_PALETI[toplam % TEDAVI_PALETI.length];
}

type RandevuKutusuProps = {
  randevu: RandevuSatir;
  gorunumDurumu: GorunumDurumu;
};

export const RandevuKutusu = memo(function RandevuKutusu({
  randevu,
  gorunumDurumu,
}: RandevuKutusuProps) {
  const stil = DURUM_STIL[gorunumDurumu];
  const renk = tedaviRengi(randevu.islem_tanimi?.id);
  const baslikMetni = [
    randevu.musteri?.ad_soyad,
    formatTime(randevu.baslangic),
    randevu.terapist?.personel?.ad_soyad,
    randevu.islem_tanimi?.ad,
    stil.etiket,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      id={`randevu-${randevu.id}`}
      title={baslikMetni}
      className={cn(
        "relative flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden rounded-lg border pl-2.5 pr-1.5 py-1 transition-colors",
        renk.dolgu,
        renk.kenar,
        stil.soluk && "opacity-50",
        stil.vurgu
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", renk.serit)} aria-hidden />

      <div className="flex items-center gap-1">
        <p className={cn("min-w-0 flex-1 truncate text-xs font-semibold text-foreground sm:text-sm", stil.adSinif)}>
          {randevu.musteri?.ad_soyad ?? "—"}
        </p>
        {gorunumDurumu === "seansta" && (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
        )}
      </div>

      <div className="flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {formatTime(randevu.baslangic)} · {randevu.terapist?.personel?.ad_soyad ?? "—"}
        </p>
        <span
          className={cn(
            "hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight sm:inline-block",
            stil.rozet
          )}
        >
          {stil.etiket}
        </span>
      </div>
    </article>
  );
});
