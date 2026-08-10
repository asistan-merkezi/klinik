"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { FaturaDurumu } from "@/types/odeme";
import { faturaTetikle } from "@/app/(app)/panel/hastalar/[id]/actions";

const DURUM_TONLARI: Record<FaturaDurumu, StatusTone> = {
  bekliyor: "amber",
  kesildi: "emerald",
  hata: "rose",
};

const DURUM_ETIKETLERI: Record<FaturaDurumu, string> = {
  bekliyor: "Bekliyor",
  kesildi: "Kesildi",
  hata: "Hata",
};

export function FaturaDurumHucresi({
  faturaId,
  durum,
  hataMesaji,
  eArsivPdfUrl,
}: {
  faturaId: string;
  durum: FaturaDurumu;
  hataMesaji: string | null;
  eArsivPdfUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);

  function tetikle() {
    startTransition(async () => {
      const sonuc = await faturaTetikle(faturaId);
      setMesaj(sonuc?.message ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={DURUM_TONLARI[durum]}>
          {DURUM_ETIKETLERI[durum]}
          {durum === "hata" && hataMesaji ? `: ${hataMesaji}` : ""}
        </StatusBadge>
        {durum === "kesildi" && eArsivPdfUrl && (
          <a href={eArsivPdfUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">
            PDF
          </a>
        )}
        {durum !== "kesildi" && (
          <Button type="button" size="xs" variant="outline" disabled={isPending} onClick={tetikle}>
            {isPending ? "Deneniyor..." : "Faturayı Kes"}
          </Button>
        )}
      </div>
      {mesaj && <span className="text-xs text-muted-foreground">{mesaj}</span>}
    </div>
  );
}
