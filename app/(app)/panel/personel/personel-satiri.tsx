"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn, telefonGoster } from "@/lib/utils";
import type { PersonelSatir } from "@/types/personel";
import { hizliPuantajKaydet } from "./actions";

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
  const [isPending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);

  function puantajKaydet(tur: "giris" | "cikis") {
    startTransition(async () => {
      setSonuc(await hizliPuantajKaydet(personel.id, tur));
    });
  }

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card
        interactive
        className="flex-col gap-2 p-3"
        onClick={() => router.push(`/panel/personel/${personel.id}`)}
      >
        <div className="flex items-center gap-3">
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
        </div>

        {yonetici && (
          <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                onClick={() => puantajKaydet("giris")}
              >
                Giriş
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/20"
                onClick={() => puantajKaydet("cikis")}
              >
                Çıkış
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:border-sky-500/30 dark:text-sky-400 dark:hover:bg-sky-500/20"
                nativeButton={false}
                render={<Link href={`/panel/personel/${personel.id}?tab=odemeler`}>Ödeme</Link>}
              />
            </div>
            {sonuc && (
              <p
                role="alert"
                className={cn("text-xs", sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}
              >
                {sonuc.message}
              </p>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}
