import { Star } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { cn, telefonGoster } from "@/lib/utils";
import type { AnketYanitiSatir, SeansDegerlendirmeSatir } from "@/types/portal";

function PuanYildizlari({ puan }: { puan: number | null }) {
  if (puan === null) return null;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-4", n <= puan ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      ))}
    </div>
  );
}

export function AnketYanitiListesi({ yanitlar }: { yanitlar: AnketYanitiSatir[] }) {
  if (yanitlar.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {yanitlar.map((y) => (
        <li key={y.id} className="flex flex-col gap-2 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PuanYildizlari puan={y.puan} />
              {y.goruldu_tarihi === null && <StatusBadge tone="rose">Yeni</StatusBadge>}
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(y.created_at)}</span>
          </div>
          {y.oneri_metni && <p>{y.oneri_metni}</p>}
          {(y.ad_soyad || y.telefon) && (
            <p className="text-xs text-muted-foreground">
              {[y.ad_soyad, telefonGoster(y.telefon)].filter(Boolean).join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SeansDegerlendirmeListesi({ degerlendirmeler }: { degerlendirmeler: SeansDegerlendirmeSatir[] }) {
  if (degerlendirmeler.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {degerlendirmeler.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PuanYildizlari puan={d.puan} />
              {d.goruldu_tarihi === null && <StatusBadge tone="rose">Yeni</StatusBadge>}
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
          </div>
          {d.oneri_metni && <p>{d.oneri_metni}</p>}
          <p className="text-xs text-muted-foreground">
            {[d.hasta?.ad_soyad, d.randevu?.terapist?.personel?.ad_soyad ? `Terapist: ${d.randevu.terapist.personel.ad_soyad}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
