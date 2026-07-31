"use client";

import { useId, useState } from "react";
import { CirclePlus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SecenekSatir } from "@/types/randevu";

export type Adim = { anahtar: string; islemTanimiId: string; not: string };

export function bosAdim(anahtar: string): Adim {
  return { anahtar, islemTanimiId: "", not: "" };
}

export function AdimEditor({
  tedaviler,
  adimlar,
  onAdimlarDegisti,
  disabled,
}: {
  tedaviler: SecenekSatir[];
  adimlar: Adim[];
  onAdimlarDegisti: (adimlar: Adim[]) => void;
  disabled?: boolean;
}) {
  const idOnEki = useId();
  const [sayac, setSayac] = useState(adimlar.length);

  function adimEkle() {
    setSayac((s) => s + 1);
    onAdimlarDegisti([...adimlar, bosAdim(`${idOnEki}-${sayac}`)]);
  }

  function adimSil(anahtar: string) {
    if (adimlar.length <= 1) return;
    onAdimlarDegisti(adimlar.filter((a) => a.anahtar !== anahtar));
  }

  function adimGuncelle(anahtar: string, alan: "islemTanimiId" | "not", deger: string) {
    onAdimlarDegisti(adimlar.map((a) => (a.anahtar === anahtar ? { ...a, [alan]: deger } : a)));
  }

  function adimTasi(index: number, yon: -1 | 1) {
    const hedef = index + yon;
    if (hedef < 0 || hedef >= adimlar.length) return;
    const kopya = [...adimlar];
    [kopya[index], kopya[hedef]] = [kopya[hedef], kopya[index]];
    onAdimlarDegisti(kopya);
  }

  const gecerliJson = JSON.stringify(
    adimlar
      .filter((a) => a.islemTanimiId)
      .map((a) => ({ islem_tanimi_id: a.islemTanimiId, not: a.not }))
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="adimlar_json" value={gecerliJson} readOnly />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Tedavi Adımları</span>
        <Button type="button" size="sm" variant="outline" onClick={adimEkle} disabled={disabled}>
          <CirclePlus className="size-4" /> Adım Ekle
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {adimlar.map((adim, index) => (
          <div
            key={adim.anahtar}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start"
          >
            <span className="w-6 shrink-0 pt-2 text-sm font-medium text-muted-foreground">
              {index + 1}.
            </span>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <Select
                value={adim.islemTanimiId || undefined}
                onValueChange={(deger) => adimGuncelle(adim.anahtar, "islemTanimiId", deger as string)}
                disabled={disabled}
                items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Tedavi seçin" />
                </SelectTrigger>
                <SelectContent>
                  {tedaviler.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Not (opsiyonel)"
                value={adim.not}
                onChange={(e) => adimGuncelle(adim.anahtar, "not", e.target.value)}
                disabled={disabled}
                className="flex-1"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || index === 0}
                onClick={() => adimTasi(index, -1)}
                aria-label="Yukarı taşı"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || index === adimlar.length - 1}
                onClick={() => adimTasi(index, 1)}
                aria-label="Aşağı taşı"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || adimlar.length === 1}
                onClick={() => adimSil(adim.anahtar)}
                aria-label="Adımı sil"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
