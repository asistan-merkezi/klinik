"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/datetime";
import { puantajKendiKaydet } from "./actions";

export function KayitFormu({ klinikId, tur }: { klinikId: string; tur: "giris" | "cikis" }) {
  const [durum, formAction, isPending] = useActionState(puantajKendiKaydet, null);

  if (durum?.success) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p role="status" className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
          {durum.message}
        </p>
        {durum.adSoyad && (
          <p className="text-sm text-muted-foreground">
            {durum.adSoyad}
            {durum.saat ? ` · ${formatTime(durum.saat)}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="klinik_id" value={klinikId} />
      <input type="hidden" name="tur" value={tur} />

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Kaydediliyor..." : tur === "giris" ? "Girişi Kaydet" : "Çıkışı Kaydet"}
      </Button>
    </form>
  );
}
