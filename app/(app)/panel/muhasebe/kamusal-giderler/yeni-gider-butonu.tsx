"use client";

import { useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GiderFormu } from "./gider-formu";

export function YeniGiderButonu() {
  const [acik, setAcik] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)}>
        <CirclePlus /> Yeni Gider Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kamusal Gider Ekle</DialogTitle>
          </DialogHeader>
          <GiderFormu
            key={formKey}
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
