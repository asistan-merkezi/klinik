"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROL_SECENEKLERI } from "@/types/personel";
import { UCRET_TIPI_SECENEKLERI, PUANTAJ_MODU_SECENEKLERI, type Pozisyon } from "@/types/pozisyon";
import { pozisyonAktifDurumDegistir, pozisyonSistemErisimiDegistir } from "./actions";

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
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${pozisyon.aktif ? "" : "text-muted-foreground line-through"}`}>
            {pozisyon.ad}
          </span>
          {pozisyon.ozel_mi && <StatusBadge tone="sky">Özel</StatusBadge>}
          {!pozisyon.aktif && <StatusBadge tone="rose">Pasif</StatusBadge>}
          {personelSayisi > 0 && (
            <span className="text-xs text-muted-foreground">
              {personelSayisi} personel
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {ROL_SECENEKLERI.find((r) => r.value === pozisyon.varsayilan_rol)?.label} ·{" "}
          {UCRET_TIPI_SECENEKLERI.find((s) => s.value === pozisyon.ucret_tipi)?.label} ·{" "}
          {PUANTAJ_MODU_SECENEKLERI.find((s) => s.value === pozisyon.puantaj_modu)?.label}
          {pozisyon.sistem_erisimi ? " · Sistem erişimi var" : " · Sistem erişimi yok"}
        </span>
      </div>
      {duzenlenebilir && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={aktifPending}
              onClick={() =>
                startAktifTransition(async () => {
                  setAktifHata(null);
                  const sonuc = await pozisyonAktifDurumDegistir(pozisyon.id, !pozisyon.aktif);
                  if (sonuc && !sonuc.success) {
                    setAktifHata(sonuc.message);
                  }
                })
              }
            >
              {pozisyon.aktif ? "Pasife al" : "Aktifleştir"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={erisimPending}
              onClick={() =>
                startErisimTransition(async () => {
                  setErisimHata(null);
                  const sonuc = await pozisyonSistemErisimiDegistir(pozisyon.id, !pozisyon.sistem_erisimi);
                  if (sonuc && !sonuc.success) {
                    setErisimHata(sonuc.message);
                  }
                })
              }
            >
              {pozisyon.sistem_erisimi ? "Sistem erişimini kapat" : "Sistem erişimini aç"}
            </Button>
          </div>
          {aktifHata && <p className="text-xs text-destructive">{aktifHata}</p>}
          {erisimHata && <p className="text-xs text-destructive">{erisimHata}</p>}
        </div>
      )}
    </li>
  );
}
