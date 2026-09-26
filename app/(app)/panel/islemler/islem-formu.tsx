"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuSatir } from "@/types/islem-tanimi";
import { islemTanimiOlustur } from "./actions";
import {
  IslemAdimSatirlari,
  bosIslemAdimi,
  toplamSureHesapla,
  type IslemAdimi,
} from "./islem-adim-satirlari";

export function IslemFormu({
  cihazlar,
  pozisyonlar,
  sablonlar,
}: {
  cihazlar: SecenekSatir[];
  pozisyonlar: SecenekSatir[];
  sablonlar: IslemAdimiSablonuSatir[];
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(islemTanimiOlustur, null);
  const [ad, setAd] = useState("");
  const [muhasebeHizmetIsmi, setMuhasebeHizmetIsmi] = useState("");
  const [muhasebeDokunuldu, setMuhasebeDokunuldu] = useState(false);
  const [adimlar, setAdimlar] = useState<IslemAdimi[]>([bosIslemAdimi(`${idOnEki}-0`)]);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [formKey, setFormKey] = useState(0);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAd("");
      setMuhasebeHizmetIsmi("");
      setMuhasebeDokunuldu(false);
      setAdimlar([bosIslemAdimi(`${idOnEki}-yeni`)]);
      setFormKey((k) => k + 1);
    }
  }

  const toplamSure = toplamSureHesapla(adimlar);

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
          <Label>Toplam Süre</Label>
          <p className="flex h-9 items-center text-sm text-muted-foreground">
            {toplamSure > 0 ? `${toplamSure} dakika` : "İşlem süreleri girilince hesaplanır"}
          </p>
        </div>
      </div>

      <IslemAdimSatirlari
        cihazlar={cihazlar}
        pozisyonlar={pozisyonlar}
        sablonlar={sablonlar}
        adimlar={adimlar}
        onAdimlarDegisti={setAdimlar}
        disabled={isPending}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="vita_fiyat">Fiyat (₺)</Label>
          <Input id="vita_fiyat" name="vita_fiyat" type="number" min={0} step="0.01" required disabled={isPending} />
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
