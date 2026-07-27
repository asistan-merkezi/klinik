"use client";

import { useActionState } from "react";
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

export function IslemFormu({
  kategoriler,
  cihazlar,
}: {
  kategoriler: SecenekSatir[];
  cihazlar: SecenekSatir[];
}) {
  const [durum, formAction, isPending] = useActionState(islemTanimiOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad">İşlem Adı</Label>
          <Input id="ad" name="ad" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="islem_kategori_id">Kategori</Label>
          <Select
            name="islem_kategori_id"
            required
            disabled={isPending}
            items={kategoriler.map((k) => ({ value: k.id, label: k.ad }))}
          >
            <SelectTrigger id="islem_kategori_id" className="w-full">
              <SelectValue placeholder="Kategori seçin" />
            </SelectTrigger>
            <SelectContent>
              {kategoriler.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label htmlFor="parasut_hizmet_kodu">Paraşüt Hizmet Kodu (opsiyonel)</Label>
          <Input id="parasut_hizmet_kodu" name="parasut_hizmet_kodu" disabled={isPending} />
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "İşlem tanımı ekle"}
      </Button>
    </form>
  );
}
