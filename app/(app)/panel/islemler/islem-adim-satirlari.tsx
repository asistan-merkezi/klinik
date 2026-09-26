"use client";

import { useId, useState } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
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
import type { IslemTanimiAdimSatir } from "@/types/islem-tanimi";

export type IslemAdimi = {
  anahtar: string;
  id?: string;
  ad: string;
  gerekliCihazId: string;
  sureDakika: string;
};

export function bosIslemAdimi(anahtar: string): IslemAdimi {
  return { anahtar, ad: "", gerekliCihazId: "", sureDakika: "" };
}

export function adimlardanIslemAdimlari(adimlar: IslemTanimiAdimSatir[], idOnEki: string): IslemAdimi[] {
  if (adimlar.length === 0) return [bosIslemAdimi(`${idOnEki}-0`)];
  return adimlar.map((a, index) => ({
    anahtar: `${idOnEki}-${index}`,
    id: a.id,
    ad: a.ad,
    gerekliCihazId: a.gerekli_cihaz_id ?? "",
    sureDakika: a.sure_dakika !== null ? String(a.sure_dakika) : "",
  }));
}

export function toplamSureHesapla(adimlar: IslemAdimi[]): number {
  return adimlar.reduce((toplam, a) => toplam + (Number(a.sureDakika) || 0), 0);
}

export function IslemAdimSatirlari({
  cihazlar,
  adimlar,
  onAdimlarDegisti,
  disabled,
}: {
  cihazlar: SecenekSatir[];
  adimlar: IslemAdimi[];
  onAdimlarDegisti: (adimlar: IslemAdimi[]) => void;
  disabled?: boolean;
}) {
  const idOnEki = useId();
  const [sayac, setSayac] = useState(adimlar.length);

  function adimEkle() {
    setSayac((s) => s + 1);
    onAdimlarDegisti([...adimlar, bosIslemAdimi(`${idOnEki}-${sayac}`)]);
  }

  function adimSil(anahtar: string) {
    if (adimlar.length <= 1) return;
    onAdimlarDegisti(adimlar.filter((a) => a.anahtar !== anahtar));
  }

  function adimGuncelle(anahtar: string, alan: "ad" | "gerekliCihazId" | "sureDakika", deger: string) {
    onAdimlarDegisti(adimlar.map((a) => (a.anahtar === anahtar ? { ...a, [alan]: deger } : a)));
  }

  const gonderilecekJson = JSON.stringify(
    adimlar.map((a) => ({
      id: a.id ?? null,
      ad: a.ad,
      gerekli_cihaz_id: a.gerekliCihazId,
      sure_dakika: a.sureDakika,
    }))
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="adimlar" value={gonderilecekJson} readOnly />

      <div className="flex flex-col gap-2">
        {adimlar.map((adim) => (
          <div
            key={adim.anahtar}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">İşlem Adı</Label>
                <Input
                  value={adim.ad}
                  onChange={(e) => adimGuncelle(adim.anahtar, "ad", e.target.value)}
                  placeholder="Ör. TENS"
                  disabled={disabled}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Gerekli Cihaz (opsiyonel)</Label>
                <Select
                  value={adim.gerekliCihazId || undefined}
                  onValueChange={(deger) => adimGuncelle(adim.anahtar, "gerekliCihazId", deger as string)}
                  disabled={disabled || cihazlar.length === 0}
                  items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
                >
                  <SelectTrigger className="w-full">
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
              <div className="flex w-full flex-col gap-1 sm:w-32">
                <Label className="text-xs text-muted-foreground">Süre (dk)</Label>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={adim.sureDakika}
                  onChange={(e) => adimGuncelle(adim.anahtar, "sureDakika", e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled || adimlar.length === 1}
              onClick={() => adimSil(adim.anahtar)}
              aria-label="İşlemi kaldır"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" size="sm" variant="outline" onClick={adimEkle} disabled={disabled} className="w-fit">
        <CirclePlus className="size-4" /> İşlem İlave Et
      </Button>
    </div>
  );
}
