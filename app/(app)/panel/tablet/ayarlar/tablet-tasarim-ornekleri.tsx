import { adSoyadMaskele, cn } from "@/lib/utils";
import { TabletBackground } from "@/components/tablet/TabletBackground";
import { TabletLogo } from "@/components/tablet/TabletLogo";
import { DurumRozeti } from "@/components/tablet/DurumRozeti";
import { ODA_DURUMU, type OdaDurumu } from "@/lib/tablet/oda-durumu";
import type { Klinik } from "@/types/klinik";
import type { TabletTemasi } from "@/types/tablet-ayarlari";

const ORNEK = {
  hastaAdi: "Ahmet Yılmaz",
  terapistAdi: "Fzt. Ayşe Kaya",
  islemAdi: "Manuel Terapi",
  sonrakiSaat: "14:30",
};

const ORNEKLER: { tema: TabletTemasi; durum: OdaDurumu }[] = [
  { tema: "acik", durum: "musait" },
  { tema: "acik", durum: "mesgul" },
  { tema: "koyu", durum: "musait" },
  { tema: "koyu", durum: "mesgul" },
];

function OrnekKart({ tema, durum, klinik }: { tema: TabletTemasi; durum: OdaDurumu; klinik: Klinik }) {
  const durumBilgisi = ODA_DURUMU[durum];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {tema === "koyu" ? "Koyu tema" : "Açık tema"} · {durumBilgisi.etiket}
      </span>
      <div
        className={cn(
          tema === "koyu" ? "dark" : "light",
          "relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-tablet-zemin text-foreground shadow-sm"
        )}
      >
        <TabletBackground renk={durumBilgisi.renk} auraOpacity={durumBilgisi.auraOpacity} />
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: "4px", backgroundColor: durumBilgisi.renk }}
        />

        <div className="relative z-10 flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <TabletLogo klinik={klinik} tema={tema} />
            <div className="h-4 w-px" style={{ backgroundColor: "rgba(148,163,184,0.25)" }} />
            <span className="text-xs font-medium">Oda 1</span>
          </div>
          <span className="text-[10px] text-muted-foreground">09:41</span>
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <DurumRozeti durum={durum} />

          {durum === "mesgul" ? (
            <>
              <span className="text-xl font-medium tracking-tight">
                {adSoyadMaskele(ORNEK.hastaAdi)}
              </span>
              <span className="text-xs text-foreground/80">{ORNEK.terapistAdi}</span>
              <span className="text-[11px] text-muted-foreground">{ORNEK.islemAdi}</span>
            </>
          ) : (
            <>
              <span className="text-xl font-medium tracking-tight">{durumBilgisi.etiket}</span>
              <span className="text-xs text-foreground/80">
                Sıradaki: {ORNEK.sonrakiSaat} · {ORNEK.terapistAdi}
              </span>
            </>
          )}
        </div>

        {durum === "mesgul" && (
          <div className="relative z-10 flex flex-col gap-1 p-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Kalan süre</span>
              <span className="font-medium">18 dk</span>
            </div>
            <div
              className="h-[2px] w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "rgba(148,163,184,0.18)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: "55%", backgroundColor: durumBilgisi.renk }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Kapı tabletinin gerçek tasarımını (TabletBackground/TabletLogo/DurumRozeti —
 * `/panel/tablet/[odaId]` ile birebir aynı bileşenler) küçük ölçekte, sabit
 * örnek verilerle gösteren 2x2 referans galerisi. Form ayarlarına (checkbox)
 * tepki vermez — amaç canlı önizleme değil, klinik_admin'e "tablet gerçekte
 * böyle görünüyor" örneği vermek.
 */
export function TabletTasarimOrnekleri({ klinik }: { klinik: Klinik }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Tasarım Örnekleri
      </span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ORNEKLER.map((ornek) => (
          <OrnekKart key={`${ornek.tema}-${ornek.durum}`} {...ornek} klinik={klinik} />
        ))}
      </div>
    </div>
  );
}
