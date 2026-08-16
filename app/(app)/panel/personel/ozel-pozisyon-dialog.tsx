"use client";

import { useActionState, useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROL_SECENEKLERI } from "@/types/personel";
import { UCRET_TIPI_SECENEKLERI, PUANTAJ_MODU_SECENEKLERI } from "@/types/pozisyon";
import { ozelPozisyonOlustur } from "./actions";

export function OzelPozisyonDialog() {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(ozelPozisyonOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
    }
  }

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
              <Label htmlFor="ozel-ad">Pozisyon Adı</Label>
              <Input id="ozel-ad" name="ad" required disabled={isPending} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="ozel-grup">Grup</Label>
                <Input id="ozel-grup" name="grup" defaultValue="Diğer" required disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ozel-rol">Varsayılan Rol</Label>
                <Select name="varsayilan_rol" disabled={isPending} defaultValue="terapist" items={ROL_SECENEKLERI}>
                  <SelectTrigger id="ozel-rol" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROL_SECENEKLERI.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ozel-ucret">Ücret Tipi</Label>
                <Select name="ucret_tipi" disabled={isPending} defaultValue="aylik_maas" items={UCRET_TIPI_SECENEKLERI}>
                  <SelectTrigger id="ozel-ucret" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UCRET_TIPI_SECENEKLERI.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ozel-puantaj">Puantaj Modu</Label>
                <Select name="puantaj_modu" disabled={isPending} defaultValue="gunluk" items={PUANTAJ_MODU_SECENEKLERI}>
                  <SelectTrigger id="ozel-puantaj" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PUANTAJ_MODU_SECENEKLERI.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input id="ozel-erisim" name="sistem_erisimi" type="checkbox" className="size-4 rounded border-input" />
              <Label htmlFor="ozel-erisim" className="cursor-pointer font-normal">
                Sistem erişimi (login hesabı) olacak
              </Label>
            </div>

            {durum && !durum.success && <p className="text-sm text-destructive">{durum.message}</p>}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Ekleniyor..." : "Ekle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
