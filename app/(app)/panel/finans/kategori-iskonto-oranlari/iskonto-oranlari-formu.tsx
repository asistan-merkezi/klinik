"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IskontoOranlari } from "@/types/iskonto-oranlari";
import { iskontoOranlariGuncelle } from "./actions";

const VARSAYILAN: IskontoOranlari = { vita_pct: 0, plus_pct: 0, elit_pct: 0, prime_pct: 0 };

export function IskontoOranlariFormu({ oranlar }: { oranlar: IskontoOranlari | null }) {
  const [durum, formAction, isPending] = useActionState(iskontoOranlariGuncelle, null);
  const degerler = oranlar ?? VARSAYILAN;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="vita_pct">Vita %</Label>
          <Input
            id="vita_pct"
            name="vita_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={degerler.vita_pct}
            required
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="plus_pct">Plus %</Label>
          <Input
            id="plus_pct"
            name="plus_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={degerler.plus_pct}
            required
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="elit_pct">Elit %</Label>
          <Input
            id="elit_pct"
            name="elit_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={degerler.elit_pct}
            required
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prime_pct">Prime %</Label>
          <Input
            id="prime_pct"
            name="prime_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={degerler.prime_pct}
            required
            disabled={isPending}
          />
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}
