"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HastaDetay } from "@/types/hasta";
import { hastaGuncelle } from "../actions";

export function HastaBasligi({
  hasta,
  duzenlenebilir,
}: {
  hasta: HastaDetay;
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const guncelleAction = hastaGuncelle.bind(null, hasta.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  if (duzenleniyor) {
    return (
      <form action={formAction} className="flex flex-col gap-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ad_soyad">Ad Soyad</Label>
            <Input id="ad_soyad" name="ad_soyad" defaultValue={hasta.ad_soyad} required disabled={isPending} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="telefon">Telefon</Label>
            <Input id="telefon" name="telefon" defaultValue={hasta.telefon} required disabled={isPending} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="dogum_tarihi">Doğum Tarihi</Label>
            <Input
              id="dogum_tarihi"
              name="dogum_tarihi"
              type="date"
              defaultValue={hasta.dogum_tarihi ?? ""}
              disabled={isPending}
            />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <input
              id="whatsapp_izin_durumu"
              name="whatsapp_izin_durumu"
              type="checkbox"
              defaultChecked={hasta.whatsapp_izin_durumu}
              disabled={isPending}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="whatsapp_izin_durumu" className="font-normal">
              WhatsApp izni
            </Label>
          </div>
        </div>

        {durum && (
          <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
            {durum.message}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setDuzenleniyor(false)}
          >
            Vazgeç
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{hasta.ad_soyad}</h1>
        <p className="text-sm text-muted-foreground">{hasta.telefon}</p>
      </div>
      {duzenlenebilir && (
        <Button type="button" size="sm" variant="outline" onClick={() => setDuzenleniyor(true)}>
          Düzenle
        </Button>
      )}
    </div>
  );
}
