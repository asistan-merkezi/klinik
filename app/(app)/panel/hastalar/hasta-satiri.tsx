"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { telefonGoster } from "@/lib/utils";
import type { HastaSatir } from "@/types/hasta";
import { kvkkOnayVer } from "./actions";

export function HastaSatiri({ hasta, gecikme }: { hasta: HastaSatir; gecikme?: number }) {
  const [kvkkPending, startKvkkTransition] = useTransition();
  const router = useRouter();

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card
        interactive
        className="flex-row items-center gap-3 p-3"
        onClick={() => router.push(`/panel/hastalar/${hasta.id}`)}
      >
        <Avatar name={hasta.ad_soyad} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{hasta.ad_soyad}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{telefonGoster(hasta.telefon)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasta.kvkk_onay_tarihi ? (
            <StatusBadge tone="emerald">
              <CheckCircle2 className="size-3.5" aria-hidden />
              KVKK onaylı · {new Date(hasta.kvkk_onay_tarihi).toLocaleDateString("tr-TR")}
            </StatusBadge>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 w-fit"
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
