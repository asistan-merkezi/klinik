"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { islemTanimiAktifDurumDegistir, islemTanimiGuncelle } from "./actions";
import {
  IslemAdimSatirlari,
  adimlardanIslemAdimlari,
  toplamSureHesapla,
  type IslemAdimi,
} from "./islem-adim-satirlari";

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
  const idOnEki = useId();
  const [ad, setAd] = useState(islem.ad);
  const [muhasebeHizmetIsmi, setMuhasebeHizmetIsmi] = useState(islem.muhasebe_hizmet_ismi ?? "");
  const [muhasebeDokunuldu, setMuhasebeDokunuldu] = useState(Boolean(islem.muhasebe_hizmet_ismi));
  const [adimlar, setAdimlar] = useState<IslemAdimi[]>(() => adimlardanIslemAdimlari(islem.adimlar, idOnEki));
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
    const toplamSure = toplamSureHesapla(adimlar);

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
              <Label>Toplam Süre</Label>
              <p className="flex h-9 items-center text-muted-foreground">
                {toplamSure > 0 ? `${toplamSure} dakika` : "İşlem süreleri girilince hesaplanır"}
              </p>
            </div>
          </div>

          <IslemAdimSatirlari
            cihazlar={cihazlar}
            adimlar={adimlar}
            onAdimlarDegisti={setAdimlar}
            disabled={isPending}
          />

          {/* Kategori (Plus/Elit/Prime) fiyat override'ları bilinçli olarak
              gizli input'a taşındı — müşteriye kategori tanımlanınca devreye
              giren bilgi, tedavi tanımı ekranında gösterilmiyor ama mevcut
              değer kaydet'te sıfırlanmasın diye formda kalıyor. */}
          <input type="hidden" name="plus_fiyat" value={islem.plus_fiyat ?? ""} />
          <input type="hidden" name="elit_fiyat" value={islem.elit_fiyat ?? ""} />
          <input type="hidden" name="prime_fiyat" value={islem.prime_fiyat ?? ""} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`vita-${islem.id}`}>Fiyat (₺)</Label>
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
      elevated
      className="gap-2 p-3"
      onClick={
        duzenlenebilir
          ? () => {
              setAd(islem.ad);
              setMuhasebeHizmetIsmi(islem.muhasebe_hizmet_ismi ?? "");
              setMuhasebeDokunuldu(Boolean(islem.muhasebe_hizmet_ismi));
              setAdimlar(adimlardanIslemAdimlari(islem.adimlar, idOnEki));
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
        {paraFormatla(islem.vita_fiyat)} (KDV %{islem.kdv_orani})
      </span>
      <span className="text-sm text-muted-foreground">
        {islem.sure_dakika !== null ? `Toplam süre: ${islem.sure_dakika} dk` : "Süre girilmemiş"}
      </span>
      {islem.adimlar.length > 0 && (
        <span className="text-sm text-muted-foreground">
          {islem.adimlar
            .map((a) => {
              const detay = [a.cihaz?.ad, a.sure_dakika !== null ? `${a.sure_dakika} dk` : null]
                .filter(Boolean)
                .join(", ");
              return detay ? `${a.ad} (${detay})` : a.ad;
            })
            .join(" · ")}
        </span>
      )}
    </Card>
  );
}
