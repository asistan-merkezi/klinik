"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuListSatir } from "@/types/islem-tanimi";
import { islemAdimiSablonuAktifDurumDegistir, islemAdimiSablonuGuncelle } from "../actions";

function SablonSatiri({
  sablon,
  pozisyonlar,
  duzenlenebilir,
}: {
  sablon: IslemAdimiSablonuListSatir;
  pozisyonlar: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [ad, setAd] = useState(sablon.ad);
  const [uygulayiciPozisyonId, setUygulayiciPozisyonId] = useState(sablon.uygulayici_pozisyon_id ?? "");
  const [sureDakika, setSureDakika] = useState(sablon.sure_dakika !== null ? String(sablon.sure_dakika) : "");
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, startKaydetTransition] = useTransition();
  const [aktifPending, startAktifTransition] = useTransition();

  function vazgec() {
    setAd(sablon.ad);
    setUygulayiciPozisyonId(sablon.uygulayici_pozisyon_id ?? "");
    setSureDakika(sablon.sure_dakika !== null ? String(sablon.sure_dakika) : "");
    setHata(null);
    setDuzenleniyor(false);
  }

  function kaydet() {
    startKaydetTransition(async () => {
      const sonuc = await islemAdimiSablonuGuncelle(sablon.id, {
        ad,
        uygulayici_pozisyon_id: uygulayiciPozisyonId || null,
        sure_dakika: sureDakika === "" ? null : Number(sureDakika),
      });
      if (sonuc?.success) {
        setHata(null);
        setDuzenleniyor(false);
      } else {
        setHata(sonuc?.message ?? "Güncellenemedi.");
      }
    });
  }

  if (duzenleniyor) {
    return (
      <Card className="gap-3 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">İşlem Adı</Label>
            <Input
              value={ad}
              onChange={(e) => setAd(isimBasHarfBuyukYap(e.target.value))}
              disabled={kaydediliyor}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Uygulayacak Kişi</Label>
            <Select
              value={uygulayiciPozisyonId || undefined}
              onValueChange={(deger) => setUygulayiciPozisyonId(deger as string)}
              disabled={kaydediliyor || pozisyonlar.length === 0}
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
            <Label className="text-xs text-muted-foreground">Süre (dk)</Label>
            <Input
              type="number"
              min={1}
              max={480}
              value={sureDakika}
              onChange={(e) => setSureDakika(e.target.value)}
              disabled={kaydediliyor}
            />
          </div>
        </div>

        {hata && <p className="text-sm text-destructive">{hata}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={kaydediliyor} onClick={kaydet}>
            {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={kaydediliyor} onClick={vazgec}>
            Vazgeç
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card elevated className="flex-row items-center justify-between gap-2 p-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className={sablon.aktif ? "font-medium" : "font-medium text-muted-foreground line-through"}>
          {sablon.ad}
        </span>
        <span className="text-sm text-muted-foreground">
          {[sablon.pozisyon?.ad, sablon.sure_dakika !== null ? `${sablon.sure_dakika} dk` : null]
            .filter(Boolean)
            .join(" · ") || "Uygulayıcı/süre girilmemiş"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge tone={sablon.aktif ? "emerald" : "slate"}>{sablon.aktif ? "Aktif" : "Pasif"}</StatusBadge>
        {duzenlenebilir && (
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`${sablon.ad} işlem tanımını düzenle`}
              onClick={() => setDuzenleniyor(true)}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={aktifPending}
              onClick={() =>
                startAktifTransition(() => islemAdimiSablonuAktifDurumDegistir(sablon.id, !sablon.aktif))
              }
            >
              {sablon.aktif ? "Pasife al" : "Aktifleştir"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function SablonListesi({
  sablonlar,
  pozisyonlar,
  duzenlenebilir,
}: {
  sablonlar: IslemAdimiSablonuListSatir[];
  pozisyonlar: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {sablonlar.map((sablon) => (
        <SablonSatiri key={sablon.id} sablon={sablon} pozisyonlar={pozisyonlar} duzenlenebilir={duzenlenebilir} />
      ))}
    </div>
  );
}
