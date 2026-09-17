"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { islemTanimiAktifDurumDegistir, islemTanimiGuncelle } from "./actions";

const paraFormatla = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function IslemSatiri({
  islem,
  cihazlar,
  duzenlenebilir,
  duzenleniyor,
  onDuzenleBaslat,
  onDuzenleBitir,
}: {
  islem: IslemTanimiSatir;
  cihazlar: SecenekSatir[];
  duzenlenebilir: boolean;
  duzenleniyor: boolean;
  onDuzenleBaslat: () => void;
  onDuzenleBitir: () => void;
}) {
  const [ad, setAd] = useState(islem.ad);
  const [muhasebeHizmetIsmi, setMuhasebeHizmetIsmi] = useState(islem.muhasebe_hizmet_ismi ?? "");
  const [muhasebeDokunuldu, setMuhasebeDokunuldu] = useState(Boolean(islem.muhasebe_hizmet_ismi));
  const guncelleAction = islemTanimiGuncelle.bind(null, islem.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [aktifPending, startAktifTransition] = useTransition();
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onDuzenleBitir();
    }
  }

  if (duzenleniyor) {
    return (
      <Card className="gap-3 p-3 sm:col-span-2 lg:col-span-3">
        <form action={formAction} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`ad-${islem.id}`}>Tedavi Adı</Label>
              <Input
                id={`ad-${islem.id}`}
                name="ad"
                value={ad}
                onChange={(e) => {
                  setAd(e.target.value);
                  if (!muhasebeDokunuldu) {
                    setMuhasebeHizmetIsmi(e.target.value);
                  }
                }}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`vita-${islem.id}`}>Fiyat (₺) — Vita</Label>
              <Input
                id={`vita-${islem.id}`}
                name="vita_fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={islem.vita_fiyat}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`plus-${islem.id}`}>Fiyat (₺) — Plus (opsiyonel)</Label>
              <Input
                id={`plus-${islem.id}`}
                name="plus_fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={islem.plus_fiyat ?? ""}
                placeholder="Boşsa iskonto oranından hesaplanır"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`elit-${islem.id}`}>Fiyat (₺) — Elit (opsiyonel)</Label>
              <Input
                id={`elit-${islem.id}`}
                name="elit_fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={islem.elit_fiyat ?? ""}
                placeholder="Boşsa iskonto oranından hesaplanır"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`prime-${islem.id}`}>Fiyat (₺) — Prime (opsiyonel)</Label>
              <Input
                id={`prime-${islem.id}`}
                name="prime_fiyat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={islem.prime_fiyat ?? ""}
                placeholder="Boşsa iskonto oranından hesaplanır"
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
                defaultValue={islem.kdv_orani}
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`sure-${islem.id}`}>Uygulama Süresi (dakika, opsiyonel)</Label>
              <Input
                id={`sure-${islem.id}`}
                name="sure_dakika"
                type="number"
                min={1}
                max={480}
                defaultValue={islem.sure_dakika ?? ""}
                placeholder="Randevu formunda otomatik doldurulur"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`cihaz-${islem.id}`}>Gerekli Cihaz (opsiyonel)</Label>
              <Select
                name="gerekli_cihaz_id"
                disabled={isPending || cihazlar.length === 0}
                defaultValue={cihazlar.find((c) => c.ad === islem.cihaz?.ad)?.id}
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
              <Label htmlFor={`muhasebe-${islem.id}`}>Muhasebe Hizmet İsmi</Label>
              <Input
                id={`muhasebe-${islem.id}`}
                name="muhasebe_hizmet_ismi"
                value={muhasebeHizmetIsmi}
                onChange={(e) => {
                  setMuhasebeDokunuldu(true);
                  setMuhasebeHizmetIsmi(e.target.value);
                }}
                disabled={isPending}
              />
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {durum.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
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
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onDuzenleBitir}>
              Vazgeç
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card
      interactive={duzenlenebilir}
      className="gap-2 p-3"
      onClick={
        duzenlenebilir
          ? () => {
              setAd(islem.ad);
              setMuhasebeHizmetIsmi(islem.muhasebe_hizmet_ismi ?? "");
              setMuhasebeDokunuldu(Boolean(islem.muhasebe_hizmet_ismi));
              onDuzenleBaslat();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-medium", !islem.aktif && "text-muted-foreground line-through")}>
          {islem.ad}
        </span>
        <StatusBadge tone={islem.aktif ? "emerald" : "slate"}>
          {islem.aktif ? "Aktif" : "Pasif"}
        </StatusBadge>
      </div>
      <span className="text-sm text-muted-foreground">
        Vita {paraFormatla(islem.vita_fiyat)}
        {islem.plus_fiyat !== null && <> · Plus {paraFormatla(islem.plus_fiyat)}</>}
        {islem.elit_fiyat !== null && <> · Elit {paraFormatla(islem.elit_fiyat)}</>}
        {islem.prime_fiyat !== null && <> · Prime {paraFormatla(islem.prime_fiyat)}</>}
        {" "}(KDV %{islem.kdv_orani})
      </span>
      <span className="text-sm text-muted-foreground">
        {islem.sure_dakika !== null ? `Uygulama süresi: ${islem.sure_dakika} dk` : "Uygulama süresi girilmemiş"}
      </span>
    </Card>
  );
}
