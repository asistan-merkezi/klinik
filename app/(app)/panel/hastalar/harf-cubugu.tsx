import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALFABE, DIGER, SAYFA_BOYUTU } from "@/lib/hasta/harf-listesi";

function listeAdresi(harf: string | null, sayfa?: number): string {
  const params = new URLSearchParams();
  if (harf) params.set("harf", harf);
  if (sayfa && sayfa > 1) params.set("sayfa", String(sayfa));
  const sorgu = params.toString();
  return sorgu ? `/panel/hastalar?${sorgu}` : "/panel/hastalar";
}

function HarfBaglantisi({
  etiket,
  harf,
  adet,
  secili,
}: {
  etiket: string;
  harf: string | null;
  adet: number;
  secili: boolean;
}) {
  const sinif = cn(
    "flex min-w-9 shrink-0 flex-col items-center rounded-xl px-2 py-1 text-sm font-semibold transition-colors",
    secili ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
  );
  const sayi = (
    <span className={cn("tabular text-[10px] font-medium", secili ? "text-primary-foreground/80" : "text-muted-foreground")}>
      {adet}
    </span>
  );

  if (adet === 0 && !secili) {
    return (
      <span className={cn(sinif, "pointer-events-none text-muted-foreground/40")} aria-disabled>
        {etiket}
        <span className="text-[10px]">&nbsp;</span>
      </span>
    );
  }
  return (
    <Link href={listeAdresi(harf)} className={sinif} aria-current={secili ? "page" : undefined}>
      {etiket}
      {sayi}
    </Link>
  );
}

/** Ada göre baş harf seçici; telefonda yatay kaydırılır. */
export function HarfCubugu({
  secili,
  sayilar,
  toplam,
}: {
  secili: string | null;
  sayilar: Map<string, number>;
  toplam: number;
}) {
  const digerAdet = sayilar.get(DIGER) ?? 0;
  return (
    <nav aria-label="Ada göre harf" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-0.5 sm:w-auto sm:flex-wrap">
        <HarfBaglantisi etiket="Tümü" harf={null} adet={toplam} secili={secili === null} />
        {ALFABE.map((h) => (
          <HarfBaglantisi key={h} etiket={h} harf={h} adet={sayilar.get(h) ?? 0} secili={secili === h} />
        ))}
        {(digerAdet > 0 || secili === DIGER) && (
          <HarfBaglantisi etiket="Diğer" harf={DIGER} adet={digerAdet} secili={secili === DIGER} />
        )}
      </div>
    </nav>
  );
}

export function SayfaGezinme({
  harf,
  sayfa,
  toplamKayit,
}: {
  harf: string | null;
  sayfa: number;
  toplamKayit: number;
}) {
  const toplamSayfa = Math.max(1, Math.ceil(toplamKayit / SAYFA_BOYUTU));
  const ilk = (sayfa - 1) * SAYFA_BOYUTU + 1;
  const son = Math.min(sayfa * SAYFA_BOYUTU, toplamKayit);

  return (
    <nav aria-label="Sayfalar" className="flex items-center justify-between gap-3 text-sm">
      <span className="tabular text-muted-foreground">
        {ilk}–{son} / {toplamKayit} hasta
      </span>
      <div className="flex items-center gap-2">
        {sayfa > 1 ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={listeAdresi(harf, sayfa - 1)}>
                <ChevronLeft /> Önceki
              </Link>
            }
          />
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft /> Önceki
          </Button>
        )}
        <span className="tabular whitespace-nowrap">
          Sayfa {sayfa} / {toplamSayfa}
        </span>
        {sayfa < toplamSayfa ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href={listeAdresi(harf, sayfa + 1)}>
                Sonraki <ChevronRight />
              </Link>
            }
          />
        ) : (
          <Button variant="outline" size="sm" disabled>
            Sonraki <ChevronRight />
          </Button>
        )}
      </div>
    </nav>
  );
}
