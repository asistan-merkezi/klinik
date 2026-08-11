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
import { cn } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";
import { RandevuFormu } from "./randevu-formu";
import { PeriyodikRandevuFormu } from "./periyodik-randevu-formu";

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

type Mod = "tekil" | "periyodik";

// Ödeme Tipi seçicideki kanıtlanmış desen: Button'ın variant="outline"
// sınıfları derlenmiş CSS'te bu emerald sınıflarından SONRA tanımlandığı için
// "!" (important) olmadan seçili sekme renklenmiyor (bkz. odeme-tipi-secici.tsx notu).
const SEKME_SECILI_SINIFI =
  "!border-emerald-500 !bg-emerald-500 !text-white hover:!bg-emerald-600 dark:hover:!bg-emerald-500/90";

export function YeniRandevuDialog({ sabitHasta, buttonLabel, ...props }: Props) {
  const searchParams = useSearchParams();
  const paramAnahtari = searchParams.toString();
  const [acik, setAcik] = useState(() => searchParams.has("oda_id"));
  const [mod, setMod] = useState<Mod>("tekil");

  // Ana Ekran'daki veya bu sayfadaki çizelgede boş bir alana tıklanınca
  // oda/tarih/saat query param'larıyla bu sayfaya (yeniden) yönlendiriliyor;
  // sayfa zaten açıkken de (aynı route içi param değişiminde) form dolu
  // olarak otomatik açılmalı.
  useEffect(() => {
    if (searchParams.has("oda_id")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL query param'ı harici bir sinyal, dialog'u senkronize açar
      setAcik(true);
      setMod("tekil");
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
        onClick={() => {
          setMod("tekil");
          setAcik(true);
        }}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <CalendarPlus /> {metin}
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Randevu</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(mod === "tekil" && SEKME_SECILI_SINIFI)}
              onClick={() => setMod("tekil")}
            >
              Tek Randevu
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(mod === "periyodik" && SEKME_SECILI_SINIFI)}
              onClick={() => setMod("periyodik")}
            >
              Periyodik Randevu
            </Button>
          </div>

          {mod === "tekil" ? (
            <RandevuFormu key={paramAnahtari} {...props} onBasarili={() => setAcik(false)} sabitHasta={sabitHasta} />
          ) : (
            <PeriyodikRandevuFormu {...props} onBasarili={() => setAcik(false)} sabitHasta={sabitHasta} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
