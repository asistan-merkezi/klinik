"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { FaturaSatir } from "@/types/odeme";
import { faturaTetikle } from "./actions";

const DURUM_TONLARI: Record<FaturaSatir["durum"], StatusTone> = {
  bekliyor: "amber",
  kesildi: "emerald",
  hata: "rose",
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
        <StatusBadge tone={DURUM_TONLARI[fatura.durum]}>
          {DURUM_ETIKETLERI[fatura.durum]}
          {fatura.durum === "hata" && fatura.hata_mesaji ? `: ${fatura.hata_mesaji}` : ""}
        </StatusBadge>
        {fatura.durum === "kesildi" && fatura.e_arsiv_pdf_url && (
          <a
            href={fatura.e_arsiv_pdf_url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline"
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
      {mesaj && <span className="text-muted-foreground">{mesaj}</span>}
    </div>
  );
}
