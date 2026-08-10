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
import { formatDateForInput } from "@/lib/datetime";
import type { SecenekSatir } from "@/types/randevu";
import { randevuTalebiOlustur } from "../actions";

export function RandevuTalepFormu({ tedaviler }: { tedaviler: SecenekSatir[] }) {
  const [durum, formAction, isPending] = useActionState(randevuTalebiOlustur, null);
  const bugun = formatDateForInput(new Date().toISOString());

  if (durum?.success) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {durum.message}
      </p>
    );
  }

  if (tedaviler.length === 0) {
    return <p className="text-sm text-muted-foreground">Şu anda seçilebilecek bir tedavi tanımı yok.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="islem_tanimi_id">Tedavi</Label>
        <Select name="islem_tanimi_id" required disabled={isPending} items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}>
          <SelectTrigger id="islem_tanimi_id" className="w-full">
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tercih_tarih">Tercih Ettiğiniz Tarih</Label>
          <Input id="tercih_tarih" name="tercih_tarih" type="date" min={bugun} defaultValue={bugun} required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tercih_saat">Tercih Ettiğiniz Saat (opsiyonel)</Label>
          <Input id="tercih_saat" name="tercih_saat" type="time" disabled={isPending} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="not_metni">Not (opsiyonel)</Label>
        <textarea
          id="not_metni"
          name="not_metni"
          rows={3}
          placeholder="Örn. belirli bir terapist tercihiniz varsa yazabilirsiniz."
          disabled={isPending}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Gönderiliyor..." : "Talep Gönder"}
      </Button>
    </form>
  );
}
