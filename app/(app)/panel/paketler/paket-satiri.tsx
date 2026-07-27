"use client";

import { useActionState, useState, useTransition } from "react";
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
import type { PaketSatir } from "@/types/paket";
import { paketAktifDurumDegistir, paketGuncelle } from "./actions";

export function PaketSatiri({
  paket,
  islemTanimlari,
  duzenlenebilir,
}: {
  paket: PaketSatir;
  islemTanimlari: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [duzenleForm, setDuzenleForm] = useState(paket);
  const guncelleAction = paketGuncelle.bind(null, paket.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [aktifPending, startAktifTransition] = useTransition();
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
              <Label htmlFor={`ad-${paket.id}`}>Paket Adı</Label>
              <Input id={`ad-${paket.id}`} name="ad" defaultValue={duzenleForm.ad} required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`islem-${paket.id}`}>İşlem</Label>
              <Select
                name="islem_tanimi_id"
                required
                disabled={isPending}
                defaultValue={islemTanimlari.find((i) => i.ad === duzenleForm.islem_tanimi?.ad)?.id}
                items={islemTanimlari.map((i) => ({ value: i.id, label: i.ad }))}
              >
                <SelectTrigger id={`islem-${paket.id}`} className="w-full">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`seans-${paket.id}`}>Seans Sayısı</Label>
              <Input
                id={`seans-${paket.id}`}
                name="seans_sayisi"
                type="number"
                min={1}
                step="1"
                defaultValue={duzenleForm.seans_sayisi}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`gecerlilik-${paket.id}`}>Geçerlilik (gün)</Label>
              <Input
                id={`gecerlilik-${paket.id}`}
                name="gecerlilik_gun"
                type="number"
                min={1}
                step="1"
                defaultValue={duzenleForm.gecerlilik_gun}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`fiyat-${paket.id}`}>Fiyat (₺)</Label>
              <Input
                id={`fiyat-${paket.id}`}
                name="fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={duzenleForm.fiyat}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`kdv-${paket.id}`}>KDV (%)</Label>
              <Input
                id={`kdv-${paket.id}`}
                name="kdv_orani"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={duzenleForm.kdv_orani}
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
        <span className={`font-medium ${paket.aktif ? "" : "text-muted-foreground line-through"}`}>
          {paket.ad}
        </span>
        <span className="text-muted-foreground">
          {paket.islem_tanimi?.ad ?? "—"} · {paket.seans_sayisi} seans · {paket.gecerlilik_gun} gün ·{" "}
          {paket.fiyat.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} (KDV %
          {paket.kdv_orani})
        </span>
      </div>
      {duzenlenebilir && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aktifPending}
            onClick={() =>
              startAktifTransition(() => paketAktifDurumDegistir(paket.id, !paket.aktif))
            }
          >
            {paket.aktif ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDuzenleForm(paket);
              setDuzenleniyor(true);
            }}
          >
            Düzenle
          </Button>
        </div>
      )}
    </li>
  );
}
