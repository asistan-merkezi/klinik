"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/datetime";
import type { SecenekSatir } from "@/types/randevu";
import type { BekleyenRandevuTalebiSatir } from "@/types/portal";
import { randevuTalebiReddet } from "./actions";
import { RandevuFormu } from "./randevu-formu";

export function BekleyenRandevuTalepleri({
  talepler,
  hastalar,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  talepler: BekleyenRandevuTalebiSatir[];
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
}) {
  const [pending, startTransition] = useTransition();
  const [islenenler, setIslenenler] = useState<Set<string>>(new Set());
  const [acikTalepId, setAcikTalepId] = useState<string | null>(null);

  const acikTalep = talepler.find((t) => t.id === acikTalepId);

  if (talepler.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {talepler.map((talep) => {
          if (islenenler.has(talep.id)) return null;
          return (
            <li
              key={talep.id}
              className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="font-medium">{talep.hasta?.ad_soyad ?? "—"}</span>
                <span className="text-muted-foreground">
                  {talep.islem_tanimi?.ad ?? "—"} · Tercih: {formatDate(talep.tercih_tarih)}
                  {talep.tercih_saat ? ` · ${talep.tercih_saat.slice(0, 5)}` : ""}
                </span>
                {talep.not_metni && <span className="text-xs text-muted-foreground">Not: {talep.not_metni}</span>}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => setAcikTalepId(talep.id)}>
                  Randevu Oluştur
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await randevuTalebiReddet(talep.id);
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

      <Dialog open={acikTalep != null} onOpenChange={(acik) => !acik && setAcikTalepId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Randevu Talebinden Randevu Oluştur</DialogTitle>
          </DialogHeader>
          {acikTalep && (
            <RandevuFormu
              key={acikTalep.id}
              hastalar={hastalar}
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
              talep={{
                id: acikTalep.id,
                hastaId: acikTalep.hasta_id,
                hastaAd: acikTalep.hasta?.ad_soyad ?? "—",
                islemTanimiId: acikTalep.islem_tanimi_id,
                tarih: acikTalep.tercih_tarih,
                saat: acikTalep.tercih_saat?.slice(0, 5),
              }}
              onBasarili={() => {
                setIslenenler((s) => new Set(s).add(acikTalep.id));
                setAcikTalepId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
