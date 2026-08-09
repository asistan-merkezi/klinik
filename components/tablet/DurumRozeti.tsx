import { cn } from "@/lib/utils";
import { ODA_DURUMU, type OdaDurumu } from "@/lib/tablet/oda-durumu";

/** Hex rengi belirli bir opaklıkta 8 haneli hex'e çevirir (ör. #10B981 + %14 -> #10B98124). */
function hexOpaklikEkle(hex: string, oran: number): string {
  const alfa = Math.round(oran * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alfa}`;
}

export function DurumRozeti({ durum }: { durum: OdaDurumu }) {
  const bilgi = ODA_DURUMU[durum];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase",
        bilgi.metinSinifi
      )}
      style={{
        backgroundColor: hexOpaklikEkle(bilgi.renk, 0.14),
        border: `1px solid ${hexOpaklikEkle(bilgi.renk, 0.45)}`,
        letterSpacing: "0.18em",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: bilgi.renk }} />
      {bilgi.etiket}
    </span>
  );
}
