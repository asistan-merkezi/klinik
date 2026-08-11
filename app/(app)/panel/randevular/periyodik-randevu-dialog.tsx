"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecenekSatir } from "@/types/randevu";
import { PeriyodikRandevuFormu } from "./periyodik-randevu-formu";

type Props = {
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  /** Hasta Detay sayfasından açılınca hasta sabit gelir, arama alanı yerine salt-okunur gösterilir */
  sabitHasta?: { id: string; ad: string };
};

export function PeriyodikRandevuDialog({ sabitHasta, ...props }: Props) {
  const [acik, setAcik] = useState(false);

  const eksik =
    (!sabitHasta && props.hastalar.length === 0) ||
    props.terapistler.length === 0 ||
    props.odalar.length === 0 ||
    props.tedaviler.length === 0;

  if (eksik) {
    return (
      <Button type="button" disabled title="Önce hasta, terapist, oda ve tedavi tanımı kaydı gerekli.">
        <CalendarClock /> Periyodik Randevu Ekle
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setAcik(true)}
      >
        <CalendarClock /> Periyodik Randevu Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Periyodik Randevu</DialogTitle>
          </DialogHeader>
          <PeriyodikRandevuFormu {...props} onBasarili={() => setAcik(false)} sabitHasta={sabitHasta} />
        </DialogContent>
      </Dialog>
    </>
  );
}
