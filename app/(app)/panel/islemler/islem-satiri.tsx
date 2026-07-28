"use client";

import { useActionState, useState, useTransition } from "react";
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
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { islemTanimiAktifDurumDegistir, islemTanimiGuncelle } from "./actions";

export function IslemSatiri({
  islem,
  cihazlar,
  duzenlenebilir,
}: {
  islem: IslemTanimiSatir;
  cihazlar: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [duzenleForm, setDuzenleForm] = useState(islem);
  const [ad, setAd] = useState(islem.ad);
  const [muhasebeHizmetIsmi, setMuhasebeHizmetIsmi] = useState(islem.muhasebe_hizmet_ismi ?? "");
  const [muhasebeDokunuldu, setMuhasebeDokunuldu] = useState(Boolean(islem.muhasebe_hizmet_ismi));
  const guncelleAction = islemTanimiGuncelle.bind(null, islem.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [aktifPending, startAktifTransition] = useTransition();
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  if (duzenleniyor) {
    return (
      <li className="py-3">
        <form action={formAction} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`ad-${islem.id}`}>Tedavi Adı</Label>
              <Input
                id={`ad-${islem.id}`}
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`fiyat-${islem.id}`}>Fiyat (₺)</Label>
              <Input
                id={`fiyat-${islem.id}`}
                name="fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={duzenleForm.fiyat}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`kdv-${islem.id}`}>KDV (%)</Label>
              <Input
                id={`kdv-${islem.id}`}
                name="kdv_orani"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={duzenleForm.kdv_orani}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`cihaz-${islem.id}`}>Gerekli Cihaz (opsiyonel)</Label>
              <Select
                name="gerekli_cihaz_id"
                disabled={isPending || cihazlar.length === 0}
                defaultValue={cihazlar.find((c) => c.ad === duzenleForm.cihaz?.ad)?.id}
                items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
              >
                <SelectTrigger id={`cihaz-${islem.id}`} className="w-full">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`muhasebe-${islem.id}`}>Muhasebe Hizmet İsmi</Label>
              <Input
                id={`muhasebe-${islem.id}`}
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
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className={`font-medium ${islem.aktif ? "" : "text-muted-foreground line-through"}`}>
          {islem.ad}
        </span>
        <span className="text-muted-foreground">
          {islem.fiyat.toLocaleString("tr-TR", {
            style: "currency",
            currency: "TRY",
          })}{" "}
          (KDV %{islem.kdv_orani})
        </span>
      </div>
      {duzenlenebilir && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aktifPending}
            onClick={() =>
              startAktifTransition(() => islemTanimiAktifDurumDegistir(islem.id, !islem.aktif))
            }
          >
            {islem.aktif ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDuzenleForm(islem);
              setAd(islem.ad);
              setMuhasebeHizmetIsmi(islem.muhasebe_hizmet_ismi ?? "");
              setMuhasebeDokunuldu(Boolean(islem.muhasebe_hizmet_ismi));
              setDuzenleniyor(true);
            }}
          >
            Düzenle
          </Button>
        </div>
      )}
    </li>
  );
}
