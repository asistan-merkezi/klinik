"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DestekTuru } from "@/types/destek";
import { talepOlustur } from "./actions";

const TUR_ETIKETLERI: Record<DestekTuru, string> = {
  talep: "Talep",
  sikayet: "Şikayet",
};
const TUR_SIRASI: DestekTuru[] = ["talep", "sikayet"];
// bkz. odeme-tipi-secici.tsx'teki not: outline variant üstüne className
// override'ı Tailwind cascade sırası yüzünden "!" olmadan kaybolabiliyor.
const TUR_SECILI_SINIFI =
  "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary-hover dark:hover:!bg-primary/80";

export function TalepFormu() {
  const idOnEki = useId();
  const [tur, setTur] = useState<DestekTuru>("talep");
  const [durum, formAction, isPending] = useActionState(talepOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [formAnahtari, setFormAnahtari] = useState(0);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setTur("talep");
      setFormAnahtari((k) => k + 1);
    }
  }

  return (
    <form key={formAnahtari} action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <input type="hidden" name="tur" value={tur} />

      <div className="flex flex-col gap-1">
        <Label>Tür</Label>
        <div className="grid grid-cols-2 gap-2">
          {TUR_SIRASI.map((t) => (
            <Button
              key={t}
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              className={cn(tur === t && TUR_SECILI_SINIFI)}
              onClick={() => setTur(t)}
            >
              {TUR_ETIKETLERI[t]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-konu`}>Konu</Label>
        <Input id={`${idOnEki}-konu`} name="konu" required maxLength={200} disabled={isPending} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama</Label>
        <textarea
          id={`${idOnEki}-aciklama`}
          name="aciklama"
          required
          rows={4}
          maxLength={4000}
          disabled={isPending}
          className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
        />
      </div>

      {durum && (
        <p
          role="alert"
          className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
        >
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Gönderiliyor..." : "Gönder"}
      </Button>
    </form>
  );
}
