"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { kamusalGiderEkle } from "./actions";

type SonucDurumu = { success: boolean; message: string } | null;

export function GiderFormu({ basariliOlunca }: { basariliOlunca?: () => void }) {
  const [durum, formAction, isPending] = useActionState(kamusalGiderEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState<SonucDurumu>(null);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      basariliOlunca?.();
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="tutar">Tutar (₺)</Label>
        <Input id="tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="tarih">Tarih</Label>
        <Input
          id="tarih"
          name="tarih"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="aciklama">Açıklama</Label>
        <Input
          id="aciklama"
          name="aciklama"
          placeholder="Örn. SGK Primi, KDV, Muhtasar Beyanname"
          disabled={isPending}
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Gider Kaydet"}
      </Button>
    </form>
  );
}
