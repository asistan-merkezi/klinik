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
import { paketOlustur } from "./actions";

export function PaketFormu({ islemTanimlari }: { islemTanimlari: SecenekSatir[] }) {
  const [durum, formAction, isPending] = useActionState(paketOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad">Paket Adı</Label>
          <Input id="ad" name="ad" placeholder="Örn. 10 Seans Manuel Terapi" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="islem_tanimi_id">İşlem</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            items={islemTanimlari.map((i) => ({ value: i.id, label: i.ad }))}
          >
            <SelectTrigger id="islem_tanimi_id" className="w-full">
              <SelectValue placeholder="İşlem seçin" />
            </SelectTrigger>
            <SelectContent>
              {islemTanimlari.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="seans_sayisi">Seans Sayısı</Label>
          <Input id="seans_sayisi" name="seans_sayisi" type="number" min={1} step="1" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="gecerlilik_gun">Geçerlilik (gün)</Label>
          <Input
            id="gecerlilik_gun"
            name="gecerlilik_gun"
            type="number"
            min={1}
            step="1"
            defaultValue={365}
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
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600" : "text-red-600"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Paket ekle"}
      </Button>
    </form>
  );
}
