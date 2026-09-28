"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BELGE_TURU_ETIKETLERI, type BelgeTuru } from "@/types/odeme";
import { ODEME_TIPI_SECILI_SINIFI } from "./odeme-tipi-secici";

const BELGE_TURU_SIRASI: BelgeTuru[] = ["fatura", "fis", "serbest"];

export function BelgeTuruSecici({
  value,
  onChange,
  disabled,
}: {
  value: BelgeTuru;
  onChange: (deger: BelgeTuru) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {BELGE_TURU_SIRASI.map((tur) => (
        <Button
          key={tur}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(value === tur && ODEME_TIPI_SECILI_SINIFI)}
          onClick={() => onChange(tur)}
        >
          {BELGE_TURU_ETIKETLERI[tur]}
        </Button>
      ))}
    </div>
  );
}
