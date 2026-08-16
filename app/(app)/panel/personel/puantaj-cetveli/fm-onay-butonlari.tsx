"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fmOnayGuncelle } from "./actions";

export function FmOnayButonlari({ personelId, puantajId }: { personelId: string; puantajId: string }) {
  const [isPending, startTransition] = useTransition();

  function onayla(durum: "onaylandi" | "reddedildi") {
    startTransition(async () => {
      await fmOnayGuncelle(personelId, puantajId, durum);
    });
  }

  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onayla("onaylandi")}
        className="h-7 px-2 text-xs text-emerald-600 dark:text-emerald-400"
      >
        Onayla
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onayla("reddedildi")}
        className="h-7 px-2 text-xs text-rose-600 dark:text-rose-400"
      >
        Reddet
      </Button>
    </div>
  );
}
