"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MusteriSatir } from "@/types/musteri";
import { kvkkOnayVer, musteriGuncelle } from "./actions";

export function MusteriSatiri({ musteri }: { musteri: MusteriSatir }) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [duzenleForm, setDuzenleForm] = useState(musteri);
  const guncelleAction = musteriGuncelle.bind(null, musteri.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [kvkkPending, startKvkkTransition] = useTransition();
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  if (duzenleniyor) {
    return (
      <li className="py-3">
        <form action={formAction} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`ad_soyad-${musteri.id}`}>Ad Soyad</Label>
              <Input
                id={`ad_soyad-${musteri.id}`}
                name="ad_soyad"
                defaultValue={duzenleForm.ad_soyad}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`telefon-${musteri.id}`}>Telefon</Label>
              <Input
                id={`telefon-${musteri.id}`}
                name="telefon"
                defaultValue={duzenleForm.telefon}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`dogum_tarihi-${musteri.id}`}>Doğum Tarihi</Label>
              <Input
                id={`dogum_tarihi-${musteri.id}`}
                name="dogum_tarihi"
                type="date"
                defaultValue={duzenleForm.dogum_tarihi ?? ""}
                disabled={isPending}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <input
                id={`whatsapp-${musteri.id}`}
                name="whatsapp_izin_durumu"
                type="checkbox"
                defaultChecked={duzenleForm.whatsapp_izin_durumu}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <Label htmlFor={`whatsapp-${musteri.id}`} className="font-normal">
                WhatsApp izni
              </Label>
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600" : "text-red-600"}>
              {durum.message}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setDuzenleniyor(false)}
            >
              Vazgeç
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{musteri.ad_soyad}</span>
        <span className="text-zinc-600 dark:text-zinc-400">{musteri.telefon}</span>
      </div>
      <div className="flex items-center gap-2">
        {musteri.kvkk_onay_tarihi ? (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            KVKK onaylı: {new Date(musteri.kvkk_onay_tarihi).toLocaleDateString("tr-TR")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={kvkkPending}
            onClick={() => startKvkkTransition(() => kvkkOnayVer(musteri.id))}
          >
            KVKK onayı al
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setDuzenleForm(musteri);
            setDuzenleniyor(true);
          }}
        >
          Düzenle
        </Button>
      </div>
    </li>
  );
}
