"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuSatir } from "@/types/islem-tanimi";
import { IslemFormu } from "./islem-formu";

export function YeniTedaviDialog({
  cihazlar,
  pozisyonlar,
  sablonlar,
}: {
  cihazlar: SecenekSatir[];
  pozisyonlar: SecenekSatir[];
  sablonlar: IslemAdimiSablonuSatir[];
}) {
  const [acik, setAcik] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setAcik(true)}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <CirclePlus /> Yeni Tedavi Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Tedavi Tanımı</DialogTitle>
          </DialogHeader>
          <IslemFormu cihazlar={cihazlar} pozisyonlar={pozisyonlar} sablonlar={sablonlar} />
        </DialogContent>
      </Dialog>
    </>
  );
}
