import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/datetime";
import type { DestekTalebi } from "@/types/destek";
import { DURUM_ETIKET, DURUM_TON, TUR_ETIKET, TUR_TON } from "./durum-etiketleri";

export function TalepListesi({ talepler }: { talepler: DestekTalebi[] }) {
  if (talepler.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz gönderdiğiniz bir talep/şikayet yok.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {talepler.map((t) => (
        <li key={t.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TUR_TON[t.tur]}>{TUR_ETIKET[t.tur]}</StatusBadge>
            <span className="truncate text-sm font-medium">{t.konu}</span>
            <StatusBadge tone={DURUM_TON[t.durum]} className="ml-auto">
              {DURUM_ETIKET[t.durum]}
            </StatusBadge>
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{t.aciklama}</p>
          <span className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
