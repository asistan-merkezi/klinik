"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CirclePlus, Trash2 } from "lucide-react";
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
import type { IslemAdimiSablonuSatir, IslemTanimiAdimSatir } from "@/types/islem-tanimi";

export type IslemAdimi = {
  anahtar: string;
  id?: string;
  ad: string;
  uygulayiciPozisyonId: string;
  gerekliCihazId: string;
  sureDakika: string;
};

export function bosIslemAdimi(anahtar: string): IslemAdimi {
  return { anahtar, ad: "", uygulayiciPozisyonId: "", gerekliCihazId: "", sureDakika: "" };
}

export function adimlardanIslemAdimlari(adimlar: IslemTanimiAdimSatir[], idOnEki: string): IslemAdimi[] {
  if (adimlar.length === 0) return [bosIslemAdimi(`${idOnEki}-0`)];
  return adimlar.map((a, index) => ({
    anahtar: `${idOnEki}-${index}`,
    id: a.id,
    ad: a.ad,
    uygulayiciPozisyonId: a.uygulayici_pozisyon_id ?? "",
    gerekliCihazId: a.gerekli_cihaz_id ?? "",
    sureDakika: a.sure_dakika !== null ? String(a.sure_dakika) : "",
  }));
}

export function toplamSureHesapla(adimlar: IslemAdimi[]): number {
  return adimlar.reduce((toplam, a) => toplam + (Number(a.sureDakika) || 0), 0);
}

export function IslemAdimSatirlari({
  cihazlar,
  pozisyonlar,
  sablonlar,
  adimlar,
  onAdimlarDegisti,
  disabled,
}: {
  cihazlar: SecenekSatir[];
  pozisyonlar: SecenekSatir[];
  sablonlar: IslemAdimiSablonuSatir[];
  adimlar: IslemAdimi[];
  onAdimlarDegisti: (adimlar: IslemAdimi[]) => void;
  disabled?: boolean;
}) {
  const idOnEki = useId();
  const [sayac, setSayac] = useState(adimlar.length);

  function adimEkle() {
    setSayac((s) => s + 1);
    onAdimlarDegisti([...adimlar, bosIslemAdimi(`${idOnEki}-${sayac}`)]);
  }

  function adimSil(anahtar: string) {
    if (adimlar.length <= 1) return;
    onAdimlarDegisti(adimlar.filter((a) => a.anahtar !== anahtar));
  }

  function adimGuncelle(
    anahtar: string,
    alan: "uygulayiciPozisyonId" | "gerekliCihazId" | "sureDakika",
    deger: string
  ) {
    onAdimlarDegisti(adimlar.map((a) => (a.anahtar === anahtar ? { ...a, [alan]: deger } : a)));
  }

  function adimSablondanDoldur(anahtar: string, sablonId: string) {
    const sablon = sablonlar.find((s) => s.id === sablonId);
    if (!sablon) return;
    onAdimlarDegisti(
      adimlar.map((a) =>
        a.anahtar === anahtar
          ? {
              ...a,
              ad: sablon.ad,
              uygulayiciPozisyonId: sablon.uygulayici_pozisyon_id ?? "",
              sureDakika: sablon.sure_dakika !== null ? String(sablon.sure_dakika) : "",
            }
          : a
      )
    );
  }

  const gonderilecekJson = JSON.stringify(
    adimlar.map((a) => ({
      id: a.id ?? null,
      ad: a.ad,
      uygulayici_pozisyon_id: a.uygulayiciPozisyonId,
      gerekli_cihaz_id: a.gerekliCihazId,
      sure_dakika: a.sureDakika,
    }))
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="adimlar" value={gonderilecekJson} readOnly />

      <div className="flex flex-col gap-2">
        {adimlar.map((adim) => (
          <div
            key={adim.anahtar}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end"
          >
            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">İşlem Adı</Label>
                <Select
                  value={sablonlar.find((s) => s.ad === adim.ad)?.id}
                  onValueChange={(deger) => adimSablondanDoldur(adim.anahtar, deger as string)}
                  disabled={disabled || sablonlar.length === 0}
                  items={sablonlar.map((s) => ({ value: s.id, label: s.ad }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={sablonlar.length === 0 ? "Kayıtlı işlem tanımı yok" : "İşlem seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sablonlar.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sablonlar.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Önce{" "}
                    <Link href="/panel/islemler/tanimlamalar" className="underline">
                      İşlem Tanımlama
                    </Link>
                    {" "}sayfasından bir işlem ekleyin.
                  </p>
                )}
                {adim.ad && sablonlar.length > 0 && !sablonlar.some((s) => s.ad === adim.ad) && (
                  <p className="text-xs text-muted-foreground">Mevcut: {adim.ad} (katalogda yok)</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">İşlem Uygulayıcı (opsiyonel)</Label>
                <Select
                  value={adim.uygulayiciPozisyonId || undefined}
                  onValueChange={(deger) =>
                    adimGuncelle(adim.anahtar, "uygulayiciPozisyonId", deger as string)
                  }
                  disabled={disabled || pozisyonlar.length === 0}
                  items={pozisyonlar.map((p) => ({ value: p.id, label: p.ad }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={pozisyonlar.length === 0 ? "Kayıtlı pozisyon yok" : "Pozisyon seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {pozisyonlar.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Gerekli Cihaz (opsiyonel)</Label>
                <Select
                  value={adim.gerekliCihazId || undefined}
                  onValueChange={(deger) => adimGuncelle(adim.anahtar, "gerekliCihazId", deger as string)}
                  disabled={disabled || cihazlar.length === 0}
                  items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
                >
                  <SelectTrigger className="w-full">
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
                <Label className="text-xs text-muted-foreground">Süre (dk)</Label>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={adim.sureDakika}
                  onChange={(e) => adimGuncelle(adim.anahtar, "sureDakika", e.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled || adimlar.length === 1}
              onClick={() => adimSil(adim.anahtar)}
              aria-label="İşlemi kaldır"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" size="sm" variant="outline" onClick={adimEkle} disabled={disabled} className="w-fit">
        <CirclePlus className="size-4" /> İşlem İlave Et
      </Button>
    </div>
  );
}
