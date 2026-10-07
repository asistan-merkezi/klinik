import { ArrowLeftRight, Landmark, Send, Truck, Users, type LucideIcon } from "lucide-react";

export type CikanSecimi = "tedarikci" | "personel" | "hesaplar_arasi" | "kamusal" | "diger";

const IKONLAR: Record<CikanSecimi, LucideIcon> = {
  tedarikci: Truck,
  personel: Users,
  hesaplar_arasi: ArrowLeftRight,
  kamusal: Landmark,
  diger: Send,
};

const BASLIKLAR: Record<CikanSecimi, string> = {
  tedarikci: "Tedarikçi",
  personel: "Personel",
  hesaplar_arasi: "Hesaplar Arası Transfer",
  kamusal: "Kamusal Ödeme",
  diger: "Diğer",
};

/** Kasadan/Bankadan Çıkan diyaloğunun ilk adımı: ikonlu, açıklamalı dikey kart listesi. */
export function CikanSecimListesi({
  aciklamalar,
  onSec,
}: {
  aciklamalar: Partial<Record<CikanSecimi, string>>;
  onSec: (secim: CikanSecimi) => void;
}) {
  const secimler = (Object.keys(aciklamalar) as CikanSecimi[]).filter((s) => aciklamalar[s]);
  return (
    <div className="flex flex-col gap-2.5">
      {secimler.map((s) => {
        const Ikon = IKONLAR[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSec(s)}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Ikon className="size-5 shrink-0 text-clinical" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-medium text-foreground">{BASLIKLAR[s]}</span>
              <span className="text-sm text-muted-foreground">{aciklamalar[s]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
