"use client";

import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IZIN_TIP_SECENEKLERI } from "@/types/izin";
import { manuelIzinEkle } from "./actions";

type PersonelSecenek = { id: string; ad_soyad: string; gorev: string };

/** Yönetici bir personel adına doğrudan (onay beklemeden) izin girer — arka planda aynı talep+onay RPC çifti çalışır. */
export function ManuelIzinEkleDialog({ personelListesi }: { personelListesi: PersonelSecenek[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(manuelIzinEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setAcik(false);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAcik(true)}>
        <CalendarPlus /> Manuel İzin Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manuel İzin Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="manuel-izin-personel">Personel</Label>
              <Select name="personel_id" required disabled={isPending} items={personelListesi.map((p) => ({ value: p.id, label: `${p.ad_soyad} · ${p.gorev}` }))}>
                <SelectTrigger id="manuel-izin-personel" className="w-full">
                  <SelectValue placeholder="Personel seçin" />
                </SelectTrigger>
                <SelectContent>
                  {personelListesi.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.ad_soyad} · {p.gorev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="manuel-izin-tip">İzin Tipi</Label>
              <Select name="tip" required disabled={isPending} defaultValue="yillik" items={IZIN_TIP_SECENEKLERI}>
                <SelectTrigger id="manuel-izin-tip" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IZIN_TIP_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="manuel-izin-baslangic">Başlangıç</Label>
                <Input id="manuel-izin-baslangic" name="baslangic_tarih" type="date" required disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="manuel-izin-bitis">Bitiş</Label>
                <Input id="manuel-izin-bitis" name="bitis_tarih" type="date" required disabled={isPending} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="manuel-izin-gerekce">Not (opsiyonel)</Label>
              <Input id="manuel-izin-gerekce" name="gerekce" disabled={isPending} placeholder="Yönetici tarafından girildi" />
            </div>

            {durum && (
              <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Ekleniyor..." : "İzni Ekle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
