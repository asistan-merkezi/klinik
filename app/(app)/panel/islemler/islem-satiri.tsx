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
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { islemTanimiAktifDurumDegistir, islemTanimiGuncelle } from "./actions";

export function IslemSatiri({
  islem,
  kategoriler,
  cihazlar,
  duzenlenebilir,
}: {
  islem: IslemTanimiSatir;
  kategoriler: SecenekSatir[];
  cihazlar: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [duzenleForm, setDuzenleForm] = useState(islem);
  const guncelleAction = islemTanimiGuncelle.bind(null, islem.id);
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
              <Label htmlFor={`ad-${islem.id}`}>İşlem Adı</Label>
              <Input id={`ad-${islem.id}`} name="ad" defaultValue={duzenleForm.ad} required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`kategori-${islem.id}`}>Kategori</Label>
              <Select
                name="islem_kategori_id"
                required
                disabled={isPending}
                defaultValue={kategoriler.find((k) => k.ad === duzenleForm.islem_kategori?.ad)?.id}
                items={kategoriler.map((k) => ({ value: k.id, label: k.ad }))}
              >
                <SelectTrigger id={`kategori-${islem.id}`} className="w-full">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`fiyat-${islem.id}`}>Fiyat (₺)</Label>
              <Input
                id={`fiyat-${islem.id}`}
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
              <Label htmlFor={`kdv-${islem.id}`}>KDV (%)</Label>
              <Input
                id={`kdv-${islem.id}`}
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`cihaz-${islem.id}`}>Gerekli Cihaz (opsiyonel)</Label>
              <Select
                name="gerekli_cihaz_id"
                disabled={isPending || cihazlar.length === 0}
                defaultValue={cihazlar.find((c) => c.ad === duzenleForm.cihaz?.ad)?.id}
                items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
              >
                <SelectTrigger id={`cihaz-${islem.id}`} className="w-full">
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
              <Label htmlFor={`parasut-${islem.id}`}>Paraşüt Hizmet Kodu</Label>
              <Input
                id={`parasut-${islem.id}`}
                name="parasut_hizmet_kodu"
                defaultValue={duzenleForm.parasut_hizmet_kodu ?? ""}
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
        <span className={`font-medium ${islem.aktif ? "" : "text-muted-foreground line-through"}`}>
          {islem.ad}
        </span>
        <span className="text-muted-foreground">
          {islem.islem_kategori?.ad ?? "—"} · {islem.fiyat.toLocaleString("tr-TR", {
            style: "currency",
            currency: "TRY",
          })}{" "}
          (KDV %{islem.kdv_orani})
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
              startAktifTransition(() => islemTanimiAktifDurumDegistir(islem.id, !islem.aktif))
            }
          >
            {islem.aktif ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDuzenleForm(islem);
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
