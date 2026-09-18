import type { Pozisyon } from "@/types/pozisyon";
import { PozisyonSatiri } from "./pozisyon-satiri";

export function PozisyonlarListesi({
  pozisyonlar,
  duzenlenebilir,
}: {
  pozisyonlar: Pozisyon[];
  duzenlenebilir: boolean;
}) {
  const gruplar = new Map<string, Pozisyon[]>();
  for (const poz of pozisyonlar) {
    const liste = gruplar.get(poz.grup) ?? [];
    liste.push(poz);
    gruplar.set(poz.grup, liste);
  }
  // Grup sırası, o gruptaki en küçük sıraya göre.
  const grupAdlari = [...gruplar.keys()].sort((a, b) => {
    const minA = Math.min(...(gruplar.get(a) ?? []).map((p) => p.sira));
    const minB = Math.min(...(gruplar.get(b) ?? []).map((p) => p.sira));
    return minA - minB;
  });

  return (
    <div className="flex flex-col gap-6">
      {grupAdlari.map((grup) => {
        const satirlar = (gruplar.get(grup) ?? []).sort((a, b) => a.sira - b.sira);
        return (
          <div key={grup} className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grup}</h2>
            <ul className="flex flex-col divide-y divide-border">
              {satirlar.map((poz) => (
                <PozisyonSatiri key={poz.id} pozisyon={poz} duzenlenebilir={duzenlenebilir} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
