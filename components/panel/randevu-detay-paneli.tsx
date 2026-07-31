"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDateForInput, formatTimeForInput } from "@/lib/datetime";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { randevuGuncelle } from "@/app/(app)/panel/randevular/actions";
import { DurumButonlari } from "@/app/(app)/panel/randevular/durum-butonlari";

function sureDakika(baslangic: string, bitis: string) {
  return Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 60_000);
}

export function RandevuDetayPaneli({
  open,
  onOpenChange,
  randevu,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  open: boolean;
  onOpenChange: (acik: boolean) => void;
  randevu: RandevuSatir | null;
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
}) {
  const guncelleAction = randevuGuncelle.bind(null, randevu?.id ?? "");
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  useEffect(() => {
    setGorulenDurum(null);
  }, [randevu?.id]);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onOpenChange(false);
    }
  }

  if (!randevu) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{randevu.hasta?.ad_soyad ?? "—"}</DialogTitle>
        </DialogHeader>

        <DurumButonlari randevu={randevu} />

        <form key={randevu.id} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="hasta_id" value={randevu.hasta_id ?? ""} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_terapist_id">Dr / Terapist</Label>
              <Select
                name="terapist_id"
                required
                disabled={isPending}
                defaultValue={randevu.terapist_id}
                items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
              >
                <SelectTrigger id="detay_terapist_id" className="w-full">
                  <SelectValue placeholder="Dr / Terapist seçin" />
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

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_oda_id">Oda</Label>
              <Select
                name="oda_id"
                required
                disabled={isPending}
                defaultValue={randevu.oda_id}
                items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
              >
                <SelectTrigger id="detay_oda_id" className="w-full">
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

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_islem_tanimi_id">Tedavi</Label>
              <Select
                name="islem_tanimi_id"
                required
                disabled={isPending}
                defaultValue={randevu.islem_tanimi?.id}
                items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
              >
                <SelectTrigger id="detay_islem_tanimi_id" className="w-full">
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

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_cihaz_id">Cihaz (opsiyonel)</Label>
              <Select
                name="cihaz_id"
                disabled={isPending || cihazlar.length === 0}
                defaultValue={randevu.cihaz_id ?? undefined}
                items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
              >
                <SelectTrigger id="detay_cihaz_id" className="w-full">
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
              <Label htmlFor="detay_tarih">Tarih</Label>
              <Input
                id="detay_tarih"
                name="tarih"
                type="date"
                defaultValue={formatDateForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_saat">Saat</Label>
              <Input
                id="detay_saat"
                name="saat"
                type="time"
                defaultValue={formatTimeForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="detay_sure_dakika">Süre (dakika)</Label>
              <Input
                id="detay_sure_dakika"
                name="sure_dakika"
                type="number"
                min={5}
                max={480}
                defaultValue={sureDakika(randevu.baslangic, randevu.bitis)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {durum.message}
            </p>
          )}

          <Button type="submit" size="sm" disabled={isPending} className="w-fit">
            {isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
