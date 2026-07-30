"use client";

import { useState } from "react";
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
};

export function YeniRandevuDialog(props: Props) {
  const searchParams = useSearchParams();
  // Ana Ekran'daki günlük çizelgede boş bir alana tıklanınca oda/tarih/saat
  // query param'larıyla bu sayfaya yönlendiriliyor; o durumda form dolu olarak
  // otomatik açılmalı.
  const [acik, setAcik] = useState(() => searchParams.has("oda_id"));

  const eksik =
    props.hastalar.length === 0 ||
    props.terapistler.length === 0 ||
    props.odalar.length === 0 ||
    props.tedaviler.length === 0;

  if (eksik) {
    return (
      <Button type="button" disabled title="Önce hasta, terapist, oda ve tedavi tanımı kaydı gerekli.">
        <CalendarPlus /> Yeni Randevu Ekle
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
        <CalendarPlus /> Yeni Randevu Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Randevu</DialogTitle>
          </DialogHeader>
          <RandevuFormu {...props} />
        </DialogContent>
      </Dialog>
    </>
  );
}
