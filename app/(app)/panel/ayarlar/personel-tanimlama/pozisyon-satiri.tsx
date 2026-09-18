"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import type { Pozisyon } from "@/types/pozisyon";
import { pozisyonAktifDurumDegistir, pozisyonSistemErisimiDegistir } from "./actions";

function IkiliSwitch({
  baslik,
  soldakiEtiket,
  sagdakiEtiket,
  checked,
  disabled,
  onCheckedChange,
}: {
  baslik: string;
  soldakiEtiket: string;
  sagdakiEtiket: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{baslik}</span>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn(!checked ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
          {soldakiEtiket}
        </span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
        <span className={cn(checked ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {sagdakiEtiket}
        </span>
      </div>
    </div>
  );
}

export function PozisyonSatiri({
  pozisyon,
  personelSayisi,
  duzenlenebilir,
}: {
  pozisyon: Pozisyon;
  personelSayisi: number;
  duzenlenebilir: boolean;
}) {
  const [aktifPending, startAktifTransition] = useTransition();
  const [aktifHata, setAktifHata] = useState<string | null>(null);
  const [erisimPending, startErisimTransition] = useTransition();
  const [erisimHata, setErisimHata] = useState<string | null>(null);

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-medium ${pozisyon.aktif ? "" : "text-muted-foreground line-through"}`}>
          {pozisyon.ad}
        </span>
        {pozisyon.ozel_mi && <StatusBadge tone="sky">Özel</StatusBadge>}
        {personelSayisi > 0 && (
          <span className="text-xs text-muted-foreground">{personelSayisi} personel</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center gap-4">
          <IkiliSwitch
            baslik="Durum"
            soldakiEtiket="Pasif"
            sagdakiEtiket="Aktif"
            checked={pozisyon.aktif}
            disabled={!duzenlenebilir || aktifPending}
            onCheckedChange={(deger) =>
              startAktifTransition(async () => {
                setAktifHata(null);
                const sonuc = await pozisyonAktifDurumDegistir(pozisyon.id, deger);
                if (sonuc && !sonuc.success) {
                  setAktifHata(sonuc.message);
                }
              })
            }
          />
          <IkiliSwitch
            baslik="Sistem Erişimi"
            soldakiEtiket="Yok"
            sagdakiEtiket="Var"
            checked={pozisyon.sistem_erisimi}
            disabled={!duzenlenebilir || erisimPending}
            onCheckedChange={(deger) =>
              startErisimTransition(async () => {
                setErisimHata(null);
                const sonuc = await pozisyonSistemErisimiDegistir(pozisyon.id, deger);
                if (sonuc && !sonuc.success) {
                  setErisimHata(sonuc.message);
                }
              })
            }
          />
        </div>
        {aktifHata && <p className="text-xs text-destructive">{aktifHata}</p>}
        {erisimHata && <p className="text-xs text-destructive">{erisimHata}</p>}
      </div>
    </li>
  );
}
