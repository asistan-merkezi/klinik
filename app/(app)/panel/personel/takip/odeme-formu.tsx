"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { odemeEkle } from "./actions";

export function OdemeFormu({ personelId }: { personelId: string }) {
  const eklemeAction = odemeEkle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);

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
        <Input id="aciklama" name="aciklama" disabled={isPending} />
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ödeme Kaydet"}
      </Button>
    </form>
  );
}
