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
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { paketOlustur } from "./actions";

export function PaketFormu({ islemTanimlari }: { islemTanimlari: SecenekSatir[] }) {
  const [durum, formAction, isPending] = useActionState(paketOlustur, null);
  const [ad, setAd] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad">Paket Adı</Label>
          <Input
            id="ad"
            name="ad"
            placeholder="Örn. 10 Seans Manuel Terapi"
            value={ad}
            onChange={(e) => setAd(isimBasHarfBuyukYap(e.target.value))}
            required
            disabled={isPending}
          />
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
          <Label htmlFor="satis_bitis_tarihi">Paket Bitiş Tarihi</Label>
          <Input
            id="satis_bitis_tarihi"
            name="satis_bitis_tarihi"
            type="date"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Boş bırakılırsa bu paket süresiz satılabilir. Bu tarih, paketin satışa açık olduğu son
            tarihtir — satın alan hastanın kullanım süresini etkilemez.
          </p>
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
          <Label htmlFor="kisi_kotasi">Kişi Kotası</Label>
          <Input id="kisi_kotasi" name="kisi_kotasi" type="number" min={1} step="1" disabled={isPending} />
          <p className="text-xs text-muted-foreground">
            Boş bırakılırsa sınır yok. Bu paketi aynı anda kullanan farklı kişi sayısı bu sayıya
            ulaşınca yeni kişilere satış durur (mevcut katılımcıların yenilemesi etkilenmez).
          </p>
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Paket ekle"}
      </Button>
    </form>
  );
}
