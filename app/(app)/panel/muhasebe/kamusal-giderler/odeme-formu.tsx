"use client";

import { useActionState, useId, useState } from "react";
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
import { ODEME_TIPI_SECENEKLERI, DONEM_AY_SECENEKLERI, type KamusalOdemeSatir } from "@/types/kamusal-odeme";

type SonucDurumu = { success: boolean; message: string } | null;
type OdemeAction = (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;

export function OdemeFormu({
  action,
  gonderButonEtiketi,
  duzenlenecek,
  varsayilanDonemAy,
  varsayilanDonemYil,
  basariliOlunca,
}: {
  action: OdemeAction;
  gonderButonEtiketi: string;
  duzenlenecek?: KamusalOdemeSatir;
  varsayilanDonemAy?: number;
  varsayilanDonemYil?: number;
  basariliOlunca?: () => void;
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(action, null);
  const [gorulenDurum, setGorulenDurum] = useState<SonucDurumu>(null);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      basariliOlunca?.();
    }
  }

  const simdi = new Date();
  const donemAyVarsayilan = duzenlenecek?.donem_ay ?? varsayilanDonemAy ?? simdi.getMonth() + 1;
  const donemYilVarsayilan = duzenlenecek?.donem_yil ?? varsayilanDonemYil ?? simdi.getFullYear();
  const yilSecenekleri = Array.from({ length: 5 }, (_, i) => donemYilVarsayilan - 2 + i);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-odeme_tipi`}>Ödeme Tipi</Label>
        <Select
          name="odeme_tipi"
          required
          disabled={isPending}
          defaultValue={duzenlenecek?.odeme_tipi}
          items={ODEME_TIPI_SECENEKLERI}
        >
          <SelectTrigger id={`${idOnEki}-odeme_tipi`} className="w-full">
            <SelectValue placeholder="Seçiniz..." />
          </SelectTrigger>
          <SelectContent>
            {ODEME_TIPI_SECENEKLERI.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
        <Input
          id={`${idOnEki}-tutar`}
          name="tutar"
          type="number"
          min={0}
          step="0.01"
          defaultValue={duzenlenecek?.tutar}
          required
          disabled={isPending}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idOnEki}-donem_ay`}>Dönem Ay</Label>
          <Select
            name="donem_ay"
            required
            disabled={isPending}
            defaultValue={String(donemAyVarsayilan)}
            items={DONEM_AY_SECENEKLERI.map((s) => ({ value: String(s.value), label: s.label }))}
          >
            <SelectTrigger id={`${idOnEki}-donem_ay`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DONEM_AY_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={String(s.value)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idOnEki}-donem_yil`}>Dönem Yıl</Label>
          <Select
            name="donem_yil"
            required
            disabled={isPending}
            defaultValue={String(donemYilVarsayilan)}
            items={yilSecenekleri.map((y) => ({ value: String(y), label: String(y) }))}
          >
            <SelectTrigger id={`${idOnEki}-donem_yil`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yilSecenekleri.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-vade_tarihi`}>Vade Tarihi</Label>
        <Input
          id={`${idOnEki}-vade_tarihi`}
          name="vade_tarihi"
          type="date"
          defaultValue={duzenlenecek?.vade_tarihi}
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-odeme_tarihi`}>Ödeme Tarihi (opsiyonel)</Label>
        <Input
          id={`${idOnEki}-odeme_tarihi`}
          name="odeme_tarihi"
          type="date"
          defaultValue={duzenlenecek?.odeme_tarihi ?? ""}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">Boş bırakılırsa ödeme &quot;Bekliyor&quot; olarak görünür.</p>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idOnEki}-notlar`}>Notlar</Label>
        <Input
          id={`${idOnEki}-notlar`}
          name="notlar"
          placeholder="Opsiyonel not..."
          defaultValue={duzenlenecek?.notlar ?? ""}
          disabled={isPending}
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : gonderButonEtiketi}
      </Button>
    </form>
  );
}
