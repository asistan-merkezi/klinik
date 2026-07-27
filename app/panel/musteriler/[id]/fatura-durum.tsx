"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { FaturaSatir } from "@/types/odeme";
import { faturaTetikle } from "./actions";

const DURUM_STILLERI: Record<FaturaSatir["durum"], string> = {
  bekliyor: "text-amber-600",
  kesildi: "text-emerald-600",
  hata: "text-red-600",
};

const DURUM_ETIKETLERI: Record<FaturaSatir["durum"], string> = {
  bekliyor: "Fatura bekliyor",
  kesildi: "Fatura kesildi",
  hata: "Fatura hatası",
};

export function FaturaDurum({ fatura }: { fatura: FaturaSatir }) {
  const [isPending, startTransition] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);

  function tetikle() {
    startTransition(async () => {
      const sonuc = await faturaTetikle(fatura.id);
      setMesaj(sonuc?.message ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className={DURUM_STILLERI[fatura.durum]}>
          {DURUM_ETIKETLERI[fatura.durum]}
          {fatura.durum === "hata" && fatura.hata_mesaji ? `: ${fatura.hata_mesaji}` : ""}
        </span>
        {fatura.durum === "kesildi" && fatura.e_arsiv_pdf_url && (
          <a
            href={fatura.e_arsiv_pdf_url}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-600 underline dark:text-zinc-400"
          >
            PDF
          </a>
        )}
        {fatura.durum !== "kesildi" && (
          <Button type="button" size="xs" variant="outline" disabled={isPending} onClick={tetikle}>
            {isPending ? "Deneniyor..." : "Faturayı Kes"}
          </Button>
        )}
      </div>
      {mesaj && <span className="text-zinc-600 dark:text-zinc-400">{mesaj}</span>}
    </div>
  );
}
