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
import { ProtokolFormu } from "./protokol-formu";
import { tedaviProtokoluOlustur } from "./actions";

export function YeniProtokolDialog({ tedaviler }: { tedaviler: SecenekSatir[] }) {
  const [acik, setAcik] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button
        type="button"
        onClick={() => setAcik(true)}
        className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
      >
        <CirclePlus /> Yeni Protokol Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Tedavi Protokolü</DialogTitle>
          </DialogHeader>
          <ProtokolFormu
            key={formKey}
            tedaviler={tedaviler}
            action={tedaviProtokoluOlustur}
            gonderButonEtiketi="Protokol ekle"
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
