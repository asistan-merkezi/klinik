"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import type { KaynakSatir } from "@/types/kaynak";
import {
  kaynakAdGuncelle,
  kaynakAdetGuncelle,
  kaynakAktifDurumDegistir,
  type KaynakTablosu,
} from "./actions";

function AdetAlani({ kaynak }: { kaynak: KaynakSatir }) {
  const [adet, setAdet] = useState(kaynak.adet ?? 1);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Adet</span>
      <Input
        type="number"
        min={1}
        value={adet}
        disabled={isPending}
        onChange={(e) => setAdet(Number(e.target.value))}
        onBlur={() => {
          if (adet >= 1 && adet !== kaynak.adet) {
            startTransition(() => kaynakAdetGuncelle(kaynak.id, adet));
          }
        }}
        className="h-7 w-16 px-2 text-sm"
      />
    </div>
  );
}

function KaynakSatiri({ tablo, kaynak }: { tablo: KaynakTablosu; kaynak: KaynakSatir }) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [ad, setAd] = useState(kaynak.ad);
  const [hata, setHata] = useState<string | null>(null);
  const [aktifPending, startAktifTransition] = useTransition();
  const [adPending, startAdTransition] = useTransition();

  if (duzenleniyor) {
    return (
      <li className="flex items-center gap-2 py-2 text-sm">
        <Input
          value={ad}
          onChange={(e) => setAd(isimBasHarfBuyukYap(e.target.value))}
          disabled={adPending}
          autoFocus
          className="h-8 flex-1"
        />
        <Button
          type="button"
          size="sm"
          disabled={adPending}
          onClick={() =>
            startAdTransition(async () => {
              const sonuc = await kaynakAdGuncelle(tablo, kaynak.id, ad);
              if (sonuc?.success) {
                setHata(null);
                setDuzenleniyor(false);
              } else {
                setHata(sonuc?.message ?? "Güncellenemedi.");
              }
            })
          }
        >
          Kaydet
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={adPending}
          onClick={() => {
            setAd(kaynak.ad);
            setHata(null);
            setDuzenleniyor(false);
          }}
        >
          Vazgeç
        </Button>
        {hata && <p className="text-xs text-destructive">{hata}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span className={kaynak.aktif ? "" : "text-muted-foreground line-through"}>{kaynak.ad}</span>
      <div className="flex items-center gap-3">
        {tablo === "cihaz" && <AdetAlani kaynak={kaynak} />}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`${kaynak.ad} adını düzenle`}
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
            startAktifTransition(() => kaynakAktifDurumDegistir(tablo, kaynak.id, !kaynak.aktif))
          }
        >
          {kaynak.aktif ? "Pasife al" : "Aktifleştir"}
        </Button>
      </div>
    </li>
  );
}

export function KaynakListesi({
  tablo,
  kaynaklar,
}: {
  tablo: KaynakTablosu;
  kaynaklar: KaynakSatir[];
}) {
  if (kaynaklar.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {kaynaklar.map((kaynak) => (
        <KaynakSatiri key={kaynak.id} tablo={tablo} kaynak={kaynak} />
      ))}
    </ul>
  );
}
