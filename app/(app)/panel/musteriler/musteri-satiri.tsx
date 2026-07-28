"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MusteriSatir } from "@/types/musteri";
import { kvkkOnayVer } from "./actions";

export function MusteriSatiri({ musteri }: { musteri: MusteriSatir }) {
  const [kvkkPending, startKvkkTransition] = useTransition();

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{musteri.ad_soyad}</span>
        <span className="text-muted-foreground">{musteri.telefon}</span>
      </div>
      <div className="flex items-center gap-2">
        {musteri.kvkk_onay_tarihi ? (
          <span className="text-xs text-muted-foreground">
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
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href={`/panel/musteriler/${musteri.id}`}>Detay</Link>}
        />
      </div>
    </li>
  );
}
