"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { seansDegerlendirmeOlustur } from "./actions";

export function SeansAnketFormu({ randevuId }: { randevuId: string }) {
  const [durum, formAction, isPending] = useActionState(seansDegerlendirmeOlustur, null);
  const [puan, setPuan] = useState<number | null>(null);

  if (durum?.success) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {durum.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="randevu_id" value={randevuId} />
      <input type="hidden" name="puan" value={puan ?? ""} />

      <div className="flex flex-col gap-2">
        <Label>Memnuniyet Puanınız</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={isPending}
              onClick={() => setPuan(n)}
              aria-label={`${n} yıldız`}
              className="rounded p-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Star
                className={cn(
                  "size-8",
                  puan !== null && n <= puan ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="oneri_metni">Önerileriniz (opsiyonel)</Label>
        <textarea
          id="oneri_metni"
          name="oneri_metni"
          rows={4}
          disabled={isPending}
          className="flex w-full rounded-lg border border-input bg-input-bg px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Gönderiliyor..." : "Gönder"}
      </Button>
    </form>
  );
}
