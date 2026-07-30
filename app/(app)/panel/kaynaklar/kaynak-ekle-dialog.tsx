"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KaynakFormu } from "./kaynak-formu";
import type { KaynakTablosu } from "./actions";

export function KaynakEkleDialog({ tablo, etiket }: { tablo: KaynakTablosu; etiket: string }) {
  const [acik, setAcik] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setAcik(true)}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <Plus /> Yeni {etiket} Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni {etiket}</DialogTitle>
          </DialogHeader>
          <KaynakFormu tablo={tablo} etiket={etiket} />
        </DialogContent>
      </Dialog>
    </>
  );
}
