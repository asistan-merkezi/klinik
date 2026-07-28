"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KaynakSatir } from "@/types/kaynak";
import { kaynakAdetGuncelle, kaynakAktifDurumDegistir, type KaynakTablosu } from "./actions";

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

export function KaynakListesi({
  tablo,
  kaynaklar,
}: {
  tablo: KaynakTablosu;
  kaynaklar: KaynakSatir[];
}) {
  const [isPending, startTransition] = useTransition();

  if (kaynaklar.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {kaynaklar.map((kaynak) => (
        <li key={kaynak.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className={kaynak.aktif ? "" : "text-muted-foreground line-through"}>{kaynak.ad}</span>
          <div className="flex items-center gap-3">
            {tablo === "cihaz" && <AdetAlani kaynak={kaynak} />}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(() => kaynakAktifDurumDegistir(tablo, kaynak.id, !kaynak.aktif))
              }
            >
              {kaynak.aktif ? "Pasife al" : "Aktifleştir"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
