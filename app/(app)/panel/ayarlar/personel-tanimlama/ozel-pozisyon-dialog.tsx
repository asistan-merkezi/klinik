"use client";

import { useActionState, useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ozelPozisyonOlustur } from "./actions";

export function OzelPozisyonDialog({ departmanlar }: { departmanlar: string[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(ozelPozisyonOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
    }
  }

  const departmanSecenekleri = departmanlar.map((d) => ({ value: d, label: d }));

  return (
    <>
      <Button type="button" onClick={() => setAcik(true)} variant="outline">
        <CirclePlus /> Özel Pozisyon Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Özel Pozisyon Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <Label htmlFor="ozel-grup">Departman</Label>
              <Select name="grup" disabled={isPending} defaultValue={departmanlar[0]} items={departmanSecenekleri}>
                <SelectTrigger id="ozel-grup" className="w-full">
                  <SelectValue placeholder="Departman seçin" />
                </SelectTrigger>
                <SelectContent>
                  {departmanlar.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ozel-ad">Ünvan</Label>
              <Input id="ozel-ad" name="ad" required disabled={isPending} placeholder="Örn. Klinik Koordinatörü" />
            </div>

            {durum && !durum.success && <p className="text-sm text-destructive">{durum.message}</p>}

            <Button type="submit" disabled={isPending || departmanlar.length === 0} className="w-fit">
              {isPending ? "Ekleniyor..." : "Ekle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
