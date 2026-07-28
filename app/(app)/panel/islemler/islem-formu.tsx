"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SecenekSatir } from "@/types/randevu";
import { islemTanimiOlustur } from "./actions";

export function IslemFormu({ cihazlar }: { cihazlar: SecenekSatir[] }) {
  const [durum, formAction, isPending] = useActionState(islemTanimiOlustur, null);
  const [ad, setAd] = useState("");
  const [muhasebeHizmetIsmi, setMuhasebeHizmetIsmi] = useState("");
  const [muhasebeDokunuldu, setMuhasebeDokunuldu] = useState(false);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [formKey, setFormKey] = useState(0);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAd("");
      setMuhasebeHizmetIsmi("");
      setMuhasebeDokunuldu(false);
      setFormKey((k) => k + 1);
    }
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad">Tedavi Adı</Label>
          <Input
            id="ad"
            name="ad"
            value={ad}
            onChange={(e) => {
              setAd(e.target.value);
              if (!muhasebeDokunuldu) {
                setMuhasebeHizmetIsmi(e.target.value);
              }
            }}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="fiyat">Fiyat (₺)</Label>
          <Input id="fiyat" name="fiyat" type="number" min={0} step="0.01" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="kdv_orani">KDV (%)</Label>
          <Input
            id="kdv_orani"
            name="kdv_orani"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={20}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="gerekli_cihaz_id">Gerekli Cihaz (opsiyonel)</Label>
          <Select
            name="gerekli_cihaz_id"
            disabled={isPending || cihazlar.length === 0}
            items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
          >
            <SelectTrigger id="gerekli_cihaz_id" className="w-full">
              <SelectValue placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"} />
            </SelectTrigger>
            <SelectContent>
              {cihazlar.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="muhasebe_hizmet_ismi">Muhasebe Hizmet İsmi (opsiyonel)</Label>
          <Input
            id="muhasebe_hizmet_ismi"
            name="muhasebe_hizmet_ismi"
            value={muhasebeHizmetIsmi}
            onChange={(e) => {
              setMuhasebeDokunuldu(true);
              setMuhasebeHizmetIsmi(e.target.value);
            }}
            disabled={isPending}
          />
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Tedavi tanımı ekle"}
      </Button>
    </form>
  );
}
