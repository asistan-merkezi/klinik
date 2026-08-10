"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { telefonGoster } from "@/lib/utils";
import type { HastaListeSatiri } from "@/types/hasta";
import { kvkkOnayVer } from "./actions";

function eksikAlanlariBul(hasta: HastaListeSatiri): string[] {
  const eksikler: string[] = [];
  if (!hasta.eposta?.trim()) eksikler.push("E-posta");
  if (!hasta.hasta_hassas?.adres?.trim()) eksikler.push("Adres");
  if (!hasta.telefon?.trim()) eksikler.push("Telefon");
  return eksikler;
}

export function HastaSatiri({ hasta, gecikme }: { hasta: HastaListeSatiri; gecikme?: number }) {
  const [kvkkPending, startKvkkTransition] = useTransition();
  const router = useRouter();
  const borcluMu = hasta.bakiye < 0;
  const eksikAlanlar = eksikAlanlariBul(hasta);

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card
        interactive
        className="flex-row items-center gap-3 p-3"
        onClick={() => router.push(`/panel/hastalar/${hasta.id}`)}
      >
        <div className="relative shrink-0">
          <Avatar name={hasta.ad_soyad} size="sm" />
          <span
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background ${
              borcluMu ? "bg-rose-500" : "bg-emerald-500"
            }`}
            title={borcluMu ? "Cari borcu var" : "Cari borcu yok"}
          >
            <span className="sr-only">{borcluMu ? "Cari borcu var" : "Cari borcu yok"}</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{hasta.ad_soyad}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{telefonGoster(hasta.telefon)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasta.kvkk_onay_tarihi ? (
            eksikAlanlar.length > 0 && (
              <StatusBadge tone="amber" className="border border-amber-500/30">
                {eksikAlanlar.join(", ")} eksik
              </StatusBadge>
            )
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 w-fit border-border bg-background hover:bg-muted"
              disabled={kvkkPending}
              onClick={(e) => {
                e.stopPropagation();
                startKvkkTransition(async () => {
                  await kvkkOnayVer(hasta.id);
                });
              }}
            >
              KVKK onayı al
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}
