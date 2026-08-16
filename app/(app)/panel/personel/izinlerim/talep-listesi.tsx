"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/datetime";
import { IZIN_DURUM_ETIKETLERI, IZIN_DURUM_TONLARI, IZIN_TIP_ETIKETLERI, type IzinTalebi } from "@/types/izin";
import { izinTalebiIptalEt } from "./actions";

export function TalepListesi({ talepler }: { talepler: IzinTalebi[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {talepler.map((talep) => (
        <TalepSatiri key={talep.id} talep={talep} />
      ))}
    </ul>
  );
}

function TalepSatiri({ talep }: { talep: IzinTalebi }) {
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  function iptalEt() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await izinTalebiIptalEt(talep.id);
      if (sonuc && !sonuc.success) setHata(sonuc.message);
    });
  }

  return (
    <li>
      <Card className="flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{IZIN_TIP_ETIKETLERI[talep.tip]}</span>
          <StatusBadge tone={IZIN_DURUM_TONLARI[talep.durum]}>{IZIN_DURUM_ETIKETLERI[talep.durum]}</StatusBadge>
        </div>
        <span className="text-sm text-muted-foreground">
          {formatDate(talep.baslangic_tarih)} – {formatDate(talep.bitis_tarih)} · {talep.gun_sayisi} gün
        </span>
        {talep.gerekce && <span className="text-sm">{talep.gerekce}</span>}
        {talep.durum === "reddedildi" && talep.red_gerekce && (
          <span className="text-sm text-rose-600 dark:text-rose-400">Red gerekçesi: {talep.red_gerekce}</span>
        )}

        {talep.durum === "beklemede" && (
          <div className="mt-1 flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={iptalEt}>
              {isPending ? "İptal ediliyor..." : "Talebi İptal Et"}
            </Button>
          </div>
        )}
        {hata && (
          <p role="alert" className="text-sm text-destructive">
            {hata}
          </p>
        )}
      </Card>
    </li>
  );
}
