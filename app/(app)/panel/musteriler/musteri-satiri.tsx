"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { MusteriSatir } from "@/types/musteri";
import { kvkkOnayVer } from "./actions";

export function MusteriSatiri({ musteri }: { musteri: MusteriSatir }) {
  const [kvkkPending, startKvkkTransition] = useTransition();
  const router = useRouter();

  return (
    <li
      className="flex cursor-pointer flex-col gap-2 py-3 text-sm hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
      onClick={() => router.push(`/panel/musteriler/${musteri.id}`)}
    >
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
            onClick={(e) => {
              e.stopPropagation();
              startKvkkTransition(() => kvkkOnayVer(musteri.id));
            }}
          >
            KVKK onayı al
          </Button>
        )}
      </div>
    </li>
  );
}
