"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { telefonYerelHaneleriCikar } from "@/lib/utils";

/** +90 sabit önekli, 10 haneli (başındaki 0 hariç) telefon girişi — hasta/veli/şirket formlarında ortak. */
export function TelefonGirisi({
  ad,
  label,
  varsayilanTelefon,
  disabled,
}: {
  ad: string;
  label: string;
  varsayilanTelefon?: string | null;
  disabled?: boolean;
}) {
  const [hane, setHane] = useState(telefonYerelHaneleriCikar(varsayilanTelefon));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={ad}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="flex h-8 shrink-0 items-center rounded-lg border border-input bg-muted px-2.5 text-sm text-muted-foreground">
          +90
        </span>
        <Input
          id={ad}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="5xx xxx xx xx"
          value={hane}
          onChange={(e) => setHane(e.target.value.replace(/\D/g, "").replace(/^0/, "").slice(0, 10))}
          disabled={disabled}
        />
      </div>
      <input type="hidden" name={ad} value={hane ? `+90${hane}` : ""} />
      {hane.length > 0 && hane.length < 10 && (
        <p className="text-xs text-destructive">Telefon numarası (başındaki 0 hariç) 10 haneli olmalı.</p>
      )}
    </div>
  );
}
