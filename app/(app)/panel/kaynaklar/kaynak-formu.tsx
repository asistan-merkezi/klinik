"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { kaynakOlustur, type KaynakTablosu } from "./actions";

export function KaynakFormu({ tablo, etiket }: { tablo: KaynakTablosu; etiket: string }) {
  const olusturAction = kaynakOlustur.bind(null, tablo);
  const [durum, formAction, isPending] = useActionState(olusturAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`ad-${tablo}`}>{etiket} adı</Label>
          <Input id={`ad-${tablo}`} name="ad" required disabled={isPending} />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ekleniyor..." : "Ekle"}
        </Button>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}
    </form>
  );
}
