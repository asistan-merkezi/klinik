"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import { GiderFormu } from "./gider-formu";
import { giderEkle } from "./actions";

export function YeniGiderButonu({
  araclar,
  bankaHesaplari,
}: {
  araclar: KlinikArac[];
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const [acik, setAcik] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus /> Yeni Gider
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Gider</DialogTitle>
          </DialogHeader>
          <GiderFormu
            key={formKey}
            action={giderEkle}
            gonderButonEtiketi="Kaydet"
            araclar={araclar}
            bankaHesaplari={bankaHesaplari}
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
