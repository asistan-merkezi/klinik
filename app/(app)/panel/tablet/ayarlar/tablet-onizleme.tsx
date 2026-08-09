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
  logoUrl,
}: TabletAyarlari & { logoUrl: string | null }) {
  const hicbirSeyGosterilmiyor =
    !hasta_adi_goster && !terapist_adi_goster && !islem_adi_goster && !durum_rengi_goster;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Önizleme
      </span>
      <div className="dark overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="flex items-center gap-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-5 w-auto object-contain" />
            )}
            <span className="text-sm font-semibold">Oda 1</span>
          </div>
          <span className="text-xs text-muted-foreground">Oda değiştir</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          {durum_rengi_goster && <StatusBadge tone="rose">Meşgul</StatusBadge>}

          {hicbirSeyGosterilmiyor ? (
            <span className="text-sm text-muted-foreground">Hiçbir bilgi gösterilmiyor</span>
          ) : (
            <>
              <span className="text-xs uppercase tracking-widest text-emerald-400">İçeride</span>
              {hasta_adi_goster && (
                <span className="text-3xl font-bold">{ORNEK.hastaAdi}</span>
              )}
              {terapist_adi_goster && (
                <span className="text-base text-foreground/80">{ORNEK.terapistAdi}</span>
              )}
              {islem_adi_goster && (
                <span className="text-sm text-foreground/70">{ORNEK.islemAdi}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
