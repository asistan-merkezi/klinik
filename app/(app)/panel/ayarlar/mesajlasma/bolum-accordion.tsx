"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOLUM_ETIKET, KANAL_SIRASI, KANAL_ETIKET, type MesajBolum, type MesajKuralSatir } from "@/types/mesajlasma";
import { KuralSatiri } from "./kural-satiri";

export function BolumAccordion({
  bolum,
  kurallar,
  varsayilanAcik = false,
}: {
  bolum: MesajBolum;
  kurallar: MesajKuralSatir[];
  varsayilanAcik?: boolean;
}) {
  const [acik, setAcik] = useState(varsayilanAcik);
  const aktifSayisi = kurallar.filter((k) => k.aktif).length;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={acik}
      >
        <span className="text-sm font-semibold">{BOLUM_ETIKET[bolum]}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {aktifSayisi}/{kurallar.length} aktif
          <ChevronDown className={cn("size-4 transition-transform", acik && "rotate-180")} aria-hidden />
        </span>
      </button>
      {acik && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Tetikleyici</th>
                {KANAL_SIRASI.map((kanal) => (
                  <th key={kanal} className="px-3 py-2 text-center font-medium">
                    {KANAL_ETIKET[kanal]}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium">Aktif</th>
                <th className="px-3 py-2 text-right font-medium">Test</th>
              </tr>
            </thead>
            <tbody>
              {kurallar.map((kural) => (
                <KuralSatiri key={kural.id} kural={kural} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
