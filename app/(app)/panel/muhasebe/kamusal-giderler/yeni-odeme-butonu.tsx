"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { KlinikArac } from "@/types/klinik";
import { OdemeFormu } from "./odeme-formu";
import { kamusalOdemeEkle } from "./actions";

export function YeniOdemeButonu({
  varsayilanDonemAy,
  varsayilanDonemYil,
  araclar,
}: {
  varsayilanDonemAy: number;
  varsayilanDonemYil: number;
  araclar: KlinikArac[];
}) {
  const [acik, setAcik] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus /> Yeni Ödeme
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Ödeme</DialogTitle>
          </DialogHeader>
          <OdemeFormu
            key={formKey}
            action={kamusalOdemeEkle}
            gonderButonEtiketi="Kaydet"
            varsayilanDonemAy={varsayilanDonemAy}
            varsayilanDonemYil={varsayilanDonemYil}
            araclar={araclar}
            basariliOlunca={() => {
              setAcik(false);
              setFormKey((k) => k + 1);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
