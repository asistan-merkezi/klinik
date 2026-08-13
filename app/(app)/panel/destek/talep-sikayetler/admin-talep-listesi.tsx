"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/datetime";
import type { DestekDurum, DestekTalebi } from "@/types/destek";
import { DURUM_ETIKET, DURUM_TON, TUR_ETIKET, TUR_TON } from "./durum-etiketleri";
import { talepDurumGuncelle } from "./actions";

const DURUM_SIRASI: DestekDurum[] = ["yeni", "inceleniyor", "cozuldu"];

export function AdminTalepListesi({ talepler }: { talepler: DestekTalebi[] }) {
  if (talepler.length === 0) {
    return <p className="text-sm text-muted-foreground">Klinikte henüz talep/şikayet yok.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {talepler.map((t) => (
        <AdminTalepSatiri key={t.id} talep={t} />
      ))}
    </ul>
  );
}

function AdminTalepSatiri({ talep }: { talep: DestekTalebi }) {
  const [pending, startTransition] = useTransition();
  const [yerelDurum, setYerelDurum] = useState<DestekDurum>(talep.durum);

  function guncelle(durum: DestekDurum) {
    startTransition(async () => {
      const r = await talepDurumGuncelle(talep.id, durum);
      if (r?.success) setYerelDurum(durum);
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={TUR_TON[talep.tur]}>{TUR_ETIKET[talep.tur]}</StatusBadge>
        <span className="truncate text-sm font-medium">{talep.konu}</span>
        <StatusBadge tone={DURUM_TON[yerelDurum]} className="ml-auto">
          {DURUM_ETIKET[yerelDurum]}
        </StatusBadge>
      </div>
      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{talep.aciklama}</p>
      <span className="text-xs text-muted-foreground">
        {talep.kullanici?.ad_soyad ?? "Bilinmeyen kullanıcı"} · {formatDateTime(talep.created_at)}
      </span>

      <div className="flex flex-wrap gap-2 pt-1">
        {DURUM_SIRASI.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || yerelDurum === d}
            onClick={() => guncelle(d)}
          >
            {DURUM_ETIKET[d]}
          </Button>
        ))}
      </div>
    </li>
  );
}
