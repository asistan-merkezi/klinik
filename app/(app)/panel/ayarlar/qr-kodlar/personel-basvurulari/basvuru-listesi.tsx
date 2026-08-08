"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { telefonGoster } from "@/lib/utils";
import { personelBasvuruDurumGuncelle } from "./actions";

type Basvuru = {
  id: string;
  ad_soyad: string;
  telefon: string;
  eposta: string | null;
  basvurulan_gorev: string | null;
  dogum_tarihi: string | null;
  mesaj: string | null;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  created_at: string;
};

const DURUM_ETIKET: Record<Basvuru["durum"], string> = {
  bekliyor: "Bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

const DURUM_SINIF: Record<Basvuru["durum"], string> = {
  bekliyor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  onaylandi: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  reddedildi: "bg-destructive/15 text-destructive",
};

export function BasvuruListesi({ basvurular }: { basvurular: Basvuru[] }) {
  const [pending, startTransition] = useTransition();
  const [yerelDurum, setYerelDurum] = useState<Record<string, Basvuru["durum"]>>({});

  if (basvurular.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz başvuru yok.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {basvurular.map((b) => {
        const durum = yerelDurum[b.id] ?? b.durum;
        return (
          <li key={b.id} className="flex flex-col gap-2 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">{b.ad_soyad}</span>
                <span className="text-muted-foreground">
                  {telefonGoster(b.telefon)}
                  {b.eposta ? ` · ${b.eposta}` : ""}
                </span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DURUM_SINIF[durum]}`}>
                {DURUM_ETIKET[durum]}
              </span>
            </div>

            {b.basvurulan_gorev && (
              <p>
                <span className="text-muted-foreground">Başvurulan görev: </span>
                {b.basvurulan_gorev}
              </p>
            )}
            {b.mesaj && <p className="text-muted-foreground">{b.mesaj}</p>}
            <p className="text-xs text-muted-foreground">{formatDateTime(b.created_at)}</p>

            {durum === "bekliyor" && (
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await personelBasvuruDurumGuncelle(b.id, "onaylandi");
                      if (r?.success) setYerelDurum((s) => ({ ...s, [b.id]: "onaylandi" }));
                    })
                  }
                >
                  Onayla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await personelBasvuruDurumGuncelle(b.id, "reddedildi");
                      if (r?.success) setYerelDurum((s) => ({ ...s, [b.id]: "reddedildi" }));
                    })
                  }
                >
                  Reddet
                </Button>
              </div>
            )}

            {durum === "onaylandi" && (
              <p className="text-xs text-muted-foreground">
                Onaylandı — hesabını{" "}
                <Link href="/panel/personel/liste" className="text-primary underline underline-offset-2">
                  Personel sayfasından
                </Link>{" "}
                oluşturabilirsiniz.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
