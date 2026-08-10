"use client";

import { useActionState, useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BAKIYE_HAREKET_ETIKETLERI } from "@/types/hasta-detay";
import { bakiyeHareketiEkle } from "./actions";

const TUR_SECENEKLERI = Object.entries(BAKIYE_HAREKET_ETIKETLERI).map(([value, label]) => ({
  value,
  label,
}));

export function BakiyeHareketiEkleButonu({ hastaId }: { hastaId: string }) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const eklemeAction = bakiyeHareketiEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bakiye Hareketi Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tur`}>Tür</Label>
              <Select name="tur" required disabled={isPending} defaultValue="odeme" items={TUR_SECENEKLERI}>
                <SelectTrigger id={`${idOnEki}-tur`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TUR_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
              <Input
                id={`${idOnEki}-tutar`}
                name="tutar"
                type="number"
                min={0}
                step="0.01"
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input id={`${idOnEki}-aciklama`} name="aciklama" disabled={isPending} />
            </div>

            {durum && (
              <p
                role="alert"
                className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
