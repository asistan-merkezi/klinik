"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { telefonGoster } from "@/lib/utils";
import { isBasvurusuDurumGuncelle } from "./actions";

type Durum = "yeni" | "incelendi" | "reddedildi" | "kabul_edildi";

type Basvuru = {
  id: string;
  ad_soyad: string;
  telefon: string;
  eposta: string | null;
  pozisyon: string | null;
  mesaj: string | null;
  durum: Durum;
  created_at: string;
};

const DURUM_ETIKET: Record<Durum, string> = {
  yeni: "Yeni",
  incelendi: "İncelendi",
  reddedildi: "Reddedildi",
  kabul_edildi: "Kabul Edildi",
};

const DURUM_SINIF: Record<Durum, string> = {
  yeni: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  incelendi: "bg-muted text-muted-foreground",
  reddedildi: "bg-destructive/15 text-destructive",
  kabul_edildi: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

export function BasvuruListesi({ basvurular }: { basvurular: Basvuru[] }) {
  const [pending, startTransition] = useTransition();
  const [yerelDurum, setYerelDurum] = useState<Record<string, Durum>>({});

  if (basvurular.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz başvuru yok.</p>;
  }

  function guncelle(id: string, durum: Durum) {
    startTransition(async () => {
      const r = await isBasvurusuDurumGuncelle(id, durum);
      if (r?.success) setYerelDurum((s) => ({ ...s, [id]: durum }));
    });
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

            {b.pozisyon && (
              <p>
                <span className="text-muted-foreground">Pozisyon: </span>
                {b.pozisyon}
              </p>
            )}
            {b.mesaj && <p className="text-muted-foreground">{b.mesaj}</p>}
            <p className="text-xs text-muted-foreground">{formatDateTime(b.created_at)}</p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" disabled={pending || durum === "incelendi"} onClick={() => guncelle(b.id, "incelendi")}>
                İncelendi
              </Button>
              <Button type="button" size="sm" disabled={pending || durum === "kabul_edildi"} onClick={() => guncelle(b.id, "kabul_edildi")}>
                Kabul Et
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending || durum === "reddedildi"} onClick={() => guncelle(b.id, "reddedildi")}>
                Reddet
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
