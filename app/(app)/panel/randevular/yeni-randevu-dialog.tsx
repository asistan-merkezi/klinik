"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecenekSatir } from "@/types/randevu";
import { RandevuFormu } from "./randevu-formu";

type Props = {
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  /** Hasta Detay sayfasından açılınca hasta sabit gelir, arama alanı yerine salt-okunur gösterilir */
  sabitHasta?: { id: string; ad: string };
  buttonLabel?: string;
};

export function YeniRandevuDialog({ sabitHasta, buttonLabel, ...props }: Props) {
  const searchParams = useSearchParams();
  const paramAnahtari = searchParams.toString();
  const [acik, setAcik] = useState(() => searchParams.has("oda_id"));

  // Ana Ekran'daki veya bu sayfadaki çizelgede boş bir alana tıklanınca
  // oda/tarih/saat query param'larıyla bu sayfaya (yeniden) yönlendiriliyor;
  // sayfa zaten açıkken de (aynı route içi param değişiminde) form dolu
  // olarak otomatik açılmalı.
  useEffect(() => {
    if (searchParams.has("oda_id")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL query param'ı harici bir sinyal, dialog'u senkronize açar
      setAcik(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramAnahtari]);

  const eksik =
    (!sabitHasta && props.hastalar.length === 0) ||
    props.terapistler.length === 0 ||
    props.odalar.length === 0 ||
    props.tedaviler.length === 0;

  const metin = buttonLabel ?? "Yeni Randevu Ekle";

  if (eksik) {
    return (
      <Button type="button" disabled title="Önce hasta, terapist, oda ve tedavi tanımı kaydı gerekli.">
        <CalendarPlus /> {metin}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setAcik(true)}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <CalendarPlus /> {metin}
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Randevu</DialogTitle>
          </DialogHeader>
          <RandevuFormu key={paramAnahtari} {...props} onBasarili={() => setAcik(false)} sabitHasta={sabitHasta} />
        </DialogContent>
      </Dialog>
    </>
  );
}
