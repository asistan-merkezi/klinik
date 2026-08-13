import { BOLUM_ETIKET, type MesajBolum, type MesajKuralSatir } from "@/types/mesajlasma";
import { KuralSatiri } from "./kural-satiri";

export function BolumKartGrubu({ bolum, kurallar }: { bolum: MesajBolum; kurallar: MesajKuralSatir[] }) {
  const aktifSayisi = kurallar.filter((k) => k.aktif).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{BOLUM_ETIKET[bolum]} Bölümü Mesajları</h2>
        <span className="text-xs text-muted-foreground">
          {aktifSayisi}/{kurallar.length} aktif
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {kurallar.map((kural) => (
          <KuralSatiri key={kural.id} kural={kural} />
        ))}
      </ul>
    </section>
  );
}
