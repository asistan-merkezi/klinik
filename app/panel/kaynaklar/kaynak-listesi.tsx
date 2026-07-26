"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { KaynakSatir } from "@/types/kaynak";
import { kaynakAktifDurumDegistir, type KaynakTablosu } from "./actions";

export function KaynakListesi({
  tablo,
  kaynaklar,
}: {
  tablo: KaynakTablosu;
  kaynaklar: KaynakSatir[];
}) {
  const [isPending, startTransition] = useTransition();

  if (kaynaklar.length === 0) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Henüz kayıt yok.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
      {kaynaklar.map((kaynak) => (
        <li key={kaynak.id} className="flex items-center justify-between py-2 text-sm">
          <span className={kaynak.aktif ? "" : "text-zinc-400 line-through"}>{kaynak.ad}</span>
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
        </li>
      ))}
    </ul>
  );
}
