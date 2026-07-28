"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { kaynakOlustur, type KaynakTablosu } from "./actions";

export function KaynakFormu({ tablo, etiket }: { tablo: KaynakTablosu; etiket: string }) {
  const olusturAction = kaynakOlustur.bind(null, tablo);
  const [durum, formAction, isPending] = useActionState(olusturAction, null);
  const [ad, setAd] = useState("");
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [formKey, setFormKey] = useState(0);
  const cihazMi = tablo === "cihaz";
  const odaMi = tablo === "oda";

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAd("");
      setFormKey((k) => k + 1);
    }
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`ad-${tablo}`}>{etiket} adı</Label>
          <Input
            id={`ad-${tablo}`}
            name="ad"
            value={ad}
            onChange={(e) => setAd(isimBasHarfBuyukYap(e.target.value))}
            required
            disabled={isPending}
          />
        </div>
        {cihazMi && (
          <div className="flex w-24 flex-col gap-2">
            <Label htmlFor={`adet-${tablo}`}>Adet</Label>
            <Input
              id={`adet-${tablo}`}
              name="adet"
              type="number"
              min={1}
              defaultValue={1}
              required
              disabled={isPending}
            />
          </div>
        )}
        {odaMi && (
          <div className="flex w-24 flex-col gap-2">
            <Label htmlFor={`kapasite-${tablo}`}>Kapasite</Label>
            <Input
              id={`kapasite-${tablo}`}
              name="kapasite"
              type="number"
              min={1}
              defaultValue={1}
              required
              disabled={isPending}
            />
          </div>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ekleniyor..." : "Ekle"}
        </Button>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}
    </form>
  );
}
