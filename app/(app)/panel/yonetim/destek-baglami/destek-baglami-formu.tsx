"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { destekBaglamiAc } from "./actions";

const SELECT_SINIFI =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

export function DestekBaglamiFormu({ klinikler }: { klinikler: { id: string; ad: string }[] }) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(destekBaglamiAc, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-klinik`}>Klinik</Label>
        <select id={`${idOnEki}-klinik`} name="klinik_id" required disabled={isPending} defaultValue="" className={SELECT_SINIFI}>
          <option value="" disabled>
            Klinik seçin
          </option>
          {klinikler.map((k) => (
            <option key={k.id} value={k.id}>
              {k.ad}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-sure`}>Süre</Label>
        <select id={`${idOnEki}-sure`} name="dakika" required disabled={isPending} defaultValue="30" className={SELECT_SINIFI}>
          <option value="15">15 dakika</option>
          <option value="30">30 dakika</option>
          <option value="60">1 saat</option>
          <option value="120">2 saat (en çok)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-gerekce`}>Gerekçe (klinik yöneticisinin denetim geçmişinde görünür)</Label>
        <textarea
          id={`${idOnEki}-gerekce`}
          name="gerekce"
          required
          minLength={10}
          maxLength={500}
          rows={3}
          disabled={isPending}
          className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Açılıyor..." : "Destek bağlamını aç"}
      </Button>
    </form>
  );
}
