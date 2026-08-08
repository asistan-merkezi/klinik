"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { TakipSatiri } from "./takip-listesi";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function TakipSatiriKart({
  satir,
  gecikme,
  onOdemeEkle,
}: {
  satir: TakipSatiri;
  gecikme?: number;
  onOdemeEkle: () => void;
}) {
  const router = useRouter();
  const kalan = satir.hakedis - satir.odenen;

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card
        interactive
        className="flex-row items-center gap-3 p-3"
        onClick={() => router.push(`/panel/personel/${satir.id}`)}
      >
        <Avatar name={satir.ad_soyad} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate font-medium", !satir.aktif && "text-muted-foreground line-through")}>
            {satir.ad_soyad}
          </span>
          <span className="truncate text-sm text-muted-foreground tabular-nums">
            Hakediş {paraFormat(satir.hakedis)} · Ödenen {paraFormat(satir.odenen)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={kalan > 0 ? "rose" : "emerald"}>{paraFormat(kalan)}</StatusBadge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onOdemeEkle();
            }}
          >
            Ödeme Ekle
          </Button>
        </div>
      </Card>
    </li>
  );
}
