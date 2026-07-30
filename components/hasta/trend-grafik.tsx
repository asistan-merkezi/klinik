"use client";

import { cn } from "@/lib/utils";

type Nokta = { tarih: string; deger: number };

/**
 * Bağımlılıksız hafif SVG çizgi grafik. recharts/d3 gibi bir kütüphane
 * eklemek yerine tercih edildi — tek seri, birkaç onlarca nokta için
 * yeterli, bundle'a ekstra ağırlık katmıyor.
 */
export function TrendGrafik({
  noktalar,
  minSkor,
  maksSkor,
  renk = "var(--primary)",
  birim,
  kompakt = false,
}: {
  noktalar: Nokta[];
  minSkor?: number | null;
  maksSkor?: number | null;
  renk?: string;
  birim?: string;
  kompakt?: boolean;
}) {
  if (noktalar.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground",
          kompakt ? "h-20" : "h-40"
        )}
      >
        Henüz ölçüm yok.
      </div>
    );
  }

  const genislik = 560;
  const yukseklik = kompakt ? 90 : 160;
  const dolgu = kompakt ? 14 : 24;

  const degerler = noktalar.map((n) => n.deger);
  const min = minSkor ?? Math.min(...degerler);
  const maks = maksSkor ?? Math.max(...degerler, min + 1);
  const aralik = maks - min || 1;

  const xAdim = noktalar.length > 1 ? (genislik - dolgu * 2) / (noktalar.length - 1) : 0;

  const noktaKoordinatlari = noktalar.map((n, i) => {
    const x = dolgu + i * xAdim;
    const y = dolgu + (1 - (n.deger - min) / aralik) * (yukseklik - dolgu * 2);
    return { x, y, ...n };
  });

  const yol = noktaKoordinatlari
    .map((n, i) => `${i === 0 ? "M" : "L"} ${n.x.toFixed(1)} ${n.y.toFixed(1)}`)
    .join(" ");

  const sonNokta = noktaKoordinatlari[noktaKoordinatlari.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${genislik} ${yukseklik}`} className="w-full" role="img" aria-label="Trend grafiği">
        <line
          x1={dolgu}
          y1={yukseklik - dolgu}
          x2={genislik - dolgu}
          y2={yukseklik - dolgu}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />
        <path d={yol} fill="none" stroke={renk} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {noktaKoordinatlari.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={3.5} fill={renk} />
        ))}
        {sonNokta && (
          <text x={sonNokta.x} y={sonNokta.y - 10} textAnchor="end" fontSize={12} fill={renk} fontWeight={600}>
            {sonNokta.deger}
            {birim}
          </text>
        )}
      </svg>
      {!kompakt && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{new Date(noktalar[0].tarih).toLocaleDateString("tr-TR")}</span>
          <span>{new Date(noktalar[noktalar.length - 1].tarih).toLocaleDateString("tr-TR")}</span>
        </div>
      )}
    </div>
  );
}
