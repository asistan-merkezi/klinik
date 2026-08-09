import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import type { TabletAyarlari } from "@/types/tablet-ayarlari";

const ORNEK = {
  hastaAdi: "Ahmet Yılmaz",
  terapistAdi: "Fzt. Ayşe Kaya",
  islemAdi: "Manuel Terapi",
};

export function TabletOnizleme({
  hasta_adi_goster,
  terapist_adi_goster,
  islem_adi_goster,
  durum_rengi_goster,
  tema,
  logoUrl,
}: TabletAyarlari & { logoUrl: string | null }) {
  const hicbirSeyGosterilmiyor =
    !hasta_adi_goster && !terapist_adi_goster && !islem_adi_goster && !durum_rengi_goster;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Önizleme
      </span>
      <div
        className={cn(
          tema === "koyu" ? "dark" : "light",
          "overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm"
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-5 w-auto object-contain" />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Logo</span>
            )}
            <span className="text-sm font-semibold">Oda 1</span>
          </div>
          <Home className="size-3.5 text-muted-foreground" />
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          {hicbirSeyGosterilmiyor ? (
            <span className="text-sm text-muted-foreground">Hiçbir bilgi gösterilmiyor</span>
          ) : (
            <>
              <div className="flex h-5 items-center">
                {durum_rengi_goster && <StatusBadge tone="rose">Meşgul</StatusBadge>}
              </div>
              <span className="text-xs uppercase tracking-widest text-emerald-400">İçeride</span>
              <div className="flex h-10 items-center">
                {hasta_adi_goster && (
                  <span className="text-3xl font-bold">{ORNEK.hastaAdi}</span>
                )}
              </div>
              <div className="flex h-6 items-center">
                {terapist_adi_goster && (
                  <span className="text-base text-foreground/80">{ORNEK.terapistAdi}</span>
                )}
              </div>
              <div className="flex h-5 items-center">
                {islem_adi_goster && (
                  <span className="text-sm text-foreground/70">{ORNEK.islemAdi}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
