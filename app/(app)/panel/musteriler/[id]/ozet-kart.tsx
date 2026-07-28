import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MusteriOzet } from "@/types/musteri-detay";
import type { Cinsiyet } from "@/types/musteri";

function yasHesapla(dogumTarihi: string | null): number | null {
  if (!dogumTarihi) return null;
  const dogum = new Date(dogumTarihi);
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogum.getFullYear();
  const ayFarki = bugun.getMonth() - dogum.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) {
    yas--;
  }
  return yas;
}

const CINSIYET_ETIKETLERI: Record<Cinsiyet, string | null> = {
  kadin: "Kadın",
  erkek: "Erkek",
  belirtilmemis: null,
};

function Stat({ etiket, deger, vurgu }: { etiket: string; deger: React.ReactNode; vurgu?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{etiket}</span>
      <span className={cn("text-base font-semibold", vurgu && "text-primary")}>{deger}</span>
    </div>
  );
}

export function OzetKart({
  adSoyad,
  telefon,
  dogumTarihi,
  cinsiyet,
  ozet,
  vasTrend,
  programAktif,
}: {
  adSoyad: string;
  telefon: string;
  dogumTarihi: string | null;
  cinsiyet: Cinsiyet | null;
  ozet: MusteriOzet | null;
  vasTrend: "yukari" | "asagi" | "sabit" | null;
  programAktif: boolean | null;
}) {
  const yas = yasHesapla(dogumTarihi);
  const cinsiyetEtiketi = cinsiyet ? CINSIYET_ETIKETLERI[cinsiyet] : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{adSoyad}</h1>
              {cinsiyetEtiketi && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {cinsiyetEtiketi}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              <a href={`tel:${telefon}`} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                {telefon}
              </a>
              {yas != null && ` · ${yas} yaşında`}
            </p>
          </div>

          {programAktif != null && (
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                programAktif
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {programAktif ? "Aktif Program" : "Program Yok"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat
            etiket="Son Seans"
            deger={ozet?.son_seans_tarihi ? new Date(ozet.son_seans_tarihi).toLocaleDateString("tr-TR") : "—"}
          />
          <Stat etiket="Kalan Paket Hakkı" deger={ozet?.kalan_paket_hakki ?? 0} />
          <Stat
            etiket="Bakiye"
            deger={(ozet?.bakiye ?? 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
            vurgu={(ozet?.bakiye ?? 0) !== 0}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Son VAS</span>
            <span className="flex items-center gap-1.5 text-base font-semibold">
              {ozet?.son_vas_skoru ?? "—"}
              {vasTrend === "yukari" && <ArrowUp className="size-4 text-destructive" aria-label="Ağrı arttı" />}
              {vasTrend === "asagi" && <ArrowDown className="size-4 text-emerald-500" aria-label="Ağrı azaldı" />}
              {vasTrend === "sabit" && <ArrowRight className="size-4 text-muted-foreground" aria-label="Değişmedi" />}
            </span>
          </div>
          <Stat etiket="No-show" deger={ozet?.no_show_sayisi ?? 0} />
        </div>
      </CardContent>
    </Card>
  );
}
