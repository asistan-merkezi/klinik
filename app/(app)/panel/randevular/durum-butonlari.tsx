"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { RandevuDurum } from "@/types/randevu";
import { randevuDurumGuncelle } from "./actions";

const SONRAKI_ADIMLAR: Partial<
  Record<RandevuDurum, { durum: RandevuDurum; etiket: string; varyant?: "outline" }[]>
> = {
  planlandi: [
    { durum: "geldi", etiket: "Geldi" },
    { durum: "gelmedi", etiket: "Gelmedi", varyant: "outline" },
    { durum: "iptal", etiket: "İptal et", varyant: "outline" },
  ],
  geldi: [{ durum: "iptal", etiket: "İptal et", varyant: "outline" }],
};

export function DurumButonlari({
  randevuId,
  durum,
}: {
  randevuId: string;
  durum: RandevuDurum;
}) {
  const [isPending, startTransition] = useTransition();
  const secenekler = SONRAKI_ADIMLAR[durum];

  if (!secenekler || secenekler.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {secenekler.map((secenek) => (
        <Button
          key={secenek.durum}
          type="button"
          size="sm"
          variant={secenek.varyant ?? "default"}
          disabled={isPending}
          onClick={() => startTransition(() => randevuDurumGuncelle(randevuId, secenek.durum))}
        >
          {secenek.etiket}
        </Button>
      ))}
    </div>
  );
}
