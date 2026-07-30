"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PersonelFormu } from "../personel-formu";
import type {
  PersonelAcilKisi,
  PersonelDetay,
  PersonelHassasMaskeli,
  PersonelMeslekiBelge,
} from "@/types/personel";

export function DuzenlePersonelDialog({
  personelId,
  personel,
  acilKisi,
  mesleki,
  maskeliHassas,
}: {
  personelId: string;
  personel: PersonelDetay;
  acilKisi: PersonelAcilKisi | null;
  mesleki: PersonelMeslekiBelge | null;
  maskeliHassas: PersonelHassasMaskeli | null;
}) {
  const [acik, setAcik] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAcik(true)}>
        <Pencil /> Düzenle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Personeli Düzenle</DialogTitle>
          </DialogHeader>
          <PersonelFormu
            mod="duzenle"
            personelId={personelId}
            initialData={personel}
            initialAcilKisi={acilKisi}
            initialMesleki={mesleki}
            maskeliHassas={maskeliHassas}
            onBasarili={() => setAcik(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
