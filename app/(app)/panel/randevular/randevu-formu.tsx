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
import { randevuOlustur } from "./actions";
import { MusteriArama } from "./musteri-arama";

type Props = {
  musteriler: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
};

export function RandevuFormu({ musteriler, terapistler, odalar, cihazlar }: Props) {
  const [durum, formAction, isPending] = useActionState(randevuOlustur, null);
  const bugun = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="musteri_arama">Müşteri</Label>
          <MusteriArama id="musteri_arama" musteriler={musteriler} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="terapist_id">Terapist</Label>
          <Select name="terapist_id" required disabled={isPending}>
            <SelectTrigger id="terapist_id" className="w-full">
              <SelectValue placeholder="Terapist seçin" />
            </SelectTrigger>
            <SelectContent>
              {terapistler.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="oda_id">Oda</Label>
          <Select name="oda_id" required disabled={isPending}>
            <SelectTrigger id="oda_id" className="w-full">
              <SelectValue placeholder="Oda seçin" />
            </SelectTrigger>
            <SelectContent>
              {odalar.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cihaz_id">Cihaz (opsiyonel)</Label>
          <Select name="cihaz_id" disabled={isPending || cihazlar.length === 0}>
            <SelectTrigger id="cihaz_id" className="w-full">
              <SelectValue
                placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"}
              />
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
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            defaultValue={bugun}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="saat">Saat</Label>
          <Input id="saat" name="saat" type="time" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="sure_dakika">Süre (dakika)</Label>
          <Input
            id="sure_dakika"
            name="sure_dakika"
            type="number"
            min={5}
            max={480}
            defaultValue={30}
            required
            disabled={isPending}
          />
        </div>
      </div>

      {durum && (
        <p
          role="alert"
          className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
        >
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Randevu oluştur"}
      </Button>
    </form>
  );
}
