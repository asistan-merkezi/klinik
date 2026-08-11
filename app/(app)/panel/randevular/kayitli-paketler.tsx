"use client";

import { cn } from "@/lib/utils";
import { useHastaAktifPaketler } from "./queries";

/**
 * Hasta seçilince (veya sabitHasta ile zaten belliyken) o hastanın kayıtlı/
 * aktif paketlerini kutucuk olarak listeler; tıklanınca Tedavi seçimini
 * paketin bağlı olduğu tedaviye otomatik ayarlar. Paketi olmayan hastada
 * (veya hasta henüz seçilmemişken) hiçbir şey render etmez.
 */
export function KayitliPaketler({
  hastaId,
  secili,
  onSec,
  disabled,
}: {
  hastaId: string;
  secili: string;
  onSec: (islemTanimiId: string) => void;
  disabled?: boolean;
}) {
  const { data: paketler = [], isLoading } = useHastaAktifPaketler(hastaId);

  if (!hastaId || isLoading || paketler.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <span className="text-xs font-medium text-muted-foreground">
        Kayıtlı Paketler — tıklayınca Tedavi otomatik seçilir
      </span>
      <div className="flex flex-wrap gap-1.5">
        {paketler.map((p) => {
          const islemTanimiId = p.paket?.islem_tanimi_id;
          if (!islemTanimiId) return null;
          const aktif = secili === islemTanimiId;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onSec(islemTanimiId)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                aktif
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-border bg-muted/60 text-foreground hover:bg-muted"
              )}
            >
              {p.paket?.ad ?? p.paket?.islem_tanimi?.ad ?? "—"} · {p.kalan_adet} hak kaldı
            </button>
          );
        })}
      </div>
    </div>
  );
}
