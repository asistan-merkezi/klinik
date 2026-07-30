"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecenekSatir } from "@/types/randevu";
import { PaketFormu } from "./paket-formu";

export function YeniPaketDialog({ islemTanimlari }: { islemTanimlari: SecenekSatir[] }) {
  const [acik, setAcik] = useState(false);

  if (islemTanimlari.length === 0) {
    return (
      <Button type="button" disabled title="Önce en az bir aktif işlem tanımı gerekli.">
        <PackagePlus /> Yeni Paket Ekle
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
        <PackagePlus /> Yeni Paket Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Paket</DialogTitle>
          </DialogHeader>
          <PaketFormu islemTanimlari={islemTanimlari} />
        </DialogContent>
      </Dialog>
    </>
  );
}
