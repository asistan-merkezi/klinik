"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn, telefonGoster } from "@/lib/utils";
import type { PersonelSatir } from "@/types/personel";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function PersonelSatiri({
  personel,
  yonetici,
  gecikme,
}: {
  personel: PersonelSatir;
  yonetici: boolean;
  gecikme?: number;
}) {
  const router = useRouter();

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card
        interactive
        className="flex-row items-center gap-3 p-3"
        onClick={() => router.push(`/panel/personel/${personel.id}`)}
      >
        <Avatar name={personel.ad_soyad} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate font-medium", !personel.aktif && "text-muted-foreground line-through")}>
            {personel.ad_soyad}
          </span>
          <span className="truncate text-sm text-muted-foreground tabular-nums">
            {telefonGoster(personel.kullanici?.telefon) || "Telefon yok"}
            {yonetici && personel.maas != null && ` · ${paraFormat(personel.maas)}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={personel.aktif ? "emerald" : "slate"}>
            {personel.aktif ? "Aktif" : "Pasif"}
          </StatusBadge>
        </div>
      </Card>
    </li>
  );
}
