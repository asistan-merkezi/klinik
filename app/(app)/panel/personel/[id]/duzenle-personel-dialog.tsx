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
  PersonelEgitim,
  PersonelHassasMaskeli,
  PersonelMeslekiBelge,
} from "@/types/personel";
import type { Pozisyon } from "@/types/pozisyon";

export function DuzenlePersonelDialog({
  personelId,
  personel,
  acilKisi,
  mesleki,
  egitim,
  maskeliHassas,
  pozisyonlar,
}: {
  personelId: string;
  personel: PersonelDetay;
  acilKisi: PersonelAcilKisi | null;
  mesleki: PersonelMeslekiBelge | null;
  egitim: PersonelEgitim[];
  maskeliHassas: PersonelHassasMaskeli | null;
  pozisyonlar: Pozisyon[];
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
            initialEgitim={egitim}
            maskeliHassas={maskeliHassas}
            pozisyonlar={pozisyonlar}
            onBasarili={() => setAcik(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
