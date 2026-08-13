import type { LucideIcon } from "lucide-react";
import type { IconTileTone } from "@/components/ui/icon-tile";
import { BOLUM_ETIKET, type MesajBolum, type MesajKuralSatir } from "@/types/mesajlasma";
import { KuralKutucuk } from "./kural-kutucuk";

export function BolumKartGrubu({
  bolum,
  kurallar,
  icon,
  tone,
}: {
  bolum: MesajBolum;
  kurallar: MesajKuralSatir[];
  icon: LucideIcon;
  tone: IconTileTone;
}) {
  const aktifSayisi = kurallar.filter((k) => k.aktif).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{BOLUM_ETIKET[bolum]}</h2>
        <span className="text-xs text-muted-foreground">
          {aktifSayisi}/{kurallar.length} aktif
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kurallar.map((kural) => (
          <KuralKutucuk key={kural.id} kural={kural} icon={icon} tone={tone} />
        ))}
      </div>
    </section>
  );
}
