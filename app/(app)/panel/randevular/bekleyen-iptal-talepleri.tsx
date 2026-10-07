"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import type { BekleyenIptalTalebiSatir } from "@/types/portal";
import { iptalTalebiOnayla, iptalTalebiReddet } from "./actions";

export function BekleyenIptalTalepleri({ talepler }: { talepler: BekleyenIptalTalebiSatir[] }) {
  const [pending, startTransition] = useTransition();
  const [islenenler, setIslenenler] = useState<Set<string>>(new Set());

  if (talepler.length === 0) {
    return null;
  }

  // Bedelli: uygun pakette 1 hak düşer, paketsizse seans bedeli bakiyeye işlenir; bedelsiz: hiçbir şeye dokunulmaz.
  function onayla(talep: BekleyenIptalTalebiSatir, bedelli: boolean) {
    startTransition(async () => {
      const r = await iptalTalebiOnayla(talep.id, talep.randevu!.id, bedelli);
      if (r?.success) {
        setIslenenler((s) => new Set(s).add(talep.id));
      }
    });
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
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
              <span className="font-medium">{talep.randevu.hasta?.ad_soyad ?? "—"}</span>
              <span className="text-muted-foreground">{formatDateTime(talep.randevu.baslangic)}</span>
              {talep.aciklama && <span className="text-muted-foreground">Açıklama: {talep.aciklama}</span>}
              {talep.gec_iptal && (
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Randevuya 18 saatten az kala talep edildi (geç iptal).
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => onayla(talep, true)}
              >
                Bedelli iptal
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onayla(talep, false)}
              >
                Bedelsiz iptal
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
