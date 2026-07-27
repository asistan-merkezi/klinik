"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { BekleyenIptalTalebiSatir } from "@/types/portal";
import { iptalTalebiOnayla, iptalTalebiReddet } from "./actions";

export function BekleyenIptalTalepleri({ talepler }: { talepler: BekleyenIptalTalebiSatir[] }) {
  const [pending, startTransition] = useTransition();
  const [islenenler, setIslenenler] = useState<Set<string>>(new Set());

  if (talepler.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {talepler.map((talep) => {
        if (islenenler.has(talep.id) || !talep.randevu) {
          return null;
        }
        return (
          <li
            key={talep.id}
            className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col">
              <span className="font-medium">{talep.randevu.musteri?.ad_soyad ?? "—"}</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {new Date(talep.randevu.baslangic).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await iptalTalebiOnayla(talep.id, talep.randevu!.id);
                    if (r?.success) {
                      setIslenenler((s) => new Set(s).add(talep.id));
                    }
                  })
                }
              >
                Onayla (iptal et)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await iptalTalebiReddet(talep.id);
                    if (r?.success) {
                      setIslenenler((s) => new Set(s).add(talep.id));
                    }
                  })
                }
              >
                Reddet
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
