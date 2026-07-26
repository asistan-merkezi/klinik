"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { musteriOlustur } from "./actions";

export function MusteriFormu() {
  const [durum, formAction, isPending] = useActionState(musteriOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad_soyad">Ad Soyad</Label>
          <Input id="ad_soyad" name="ad_soyad" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input id="telefon" name="telefon" type="tel" placeholder="05xx xxx xx xx" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dogum_tarihi">Doğum Tarihi (opsiyonel)</Label>
          <Input id="dogum_tarihi" name="dogum_tarihi" type="date" disabled={isPending} />
        </div>

        <div className="flex items-end gap-2 pb-2">
          <input
            id="whatsapp_izin_durumu"
            name="whatsapp_izin_durumu"
            type="checkbox"
            disabled={isPending}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <Label htmlFor="whatsapp_izin_durumu" className="font-normal">
            WhatsApp bildirimlerine izin veriyor
          </Label>
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600" : "text-red-600"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Müşteri ekle"}
      </Button>
    </form>
  );
}
