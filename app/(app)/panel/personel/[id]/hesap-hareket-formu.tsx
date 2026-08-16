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
import { MANUEL_HESAP_HAREKET_SECENEKLERI } from "@/types/hesap-hareket";
import { hesapHareketiEkle } from "./actions";

export function HesapHareketFormu({ personelId }: { personelId: string }) {
  const eklemeAction = hesapHareketiEkle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tur">Tür</Label>
          <Select name="tur" required disabled={isPending} defaultValue="prim" items={MANUEL_HESAP_HAREKET_SECENEKLERI}>
            <SelectTrigger id="tur" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUEL_HESAP_HAREKET_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="tutar">Tutar (₺)</Label>
          <Input id="tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="aciklama">Açıklama</Label>
          <Input id="aciklama" name="aciklama" disabled={isPending} />
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" size="sm" disabled={isPending} className="w-fit">
        {isPending ? "Ekleniyor..." : "Hareket ekle"}
      </Button>
    </form>
  );
}
