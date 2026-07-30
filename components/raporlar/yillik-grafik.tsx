import type { YillikAy } from "@/types/raporlar";

/**
 * Bağımlılıksız SVG çift çubuklu grafik (trend-grafik.tsx'teki gibi
 * recharts/d3 eklemek yerine tercih edildi). Gelir/Gider renk çifti
 * dataviz skill'inin validator'ından geçirildi (proje yüzeyleriyle,
 * #E9F0F6 açık / #1e293b koyu): CVD ayrımı 6-8 bandında (WARN, "sadece
 * ikincil kodlamayla yasal") — bu yüzden değerler tooltip'te ve legend'de
 * her zaman metinle de veriliyor, sadece renge güvenilmiyor.
 */
export function YillikGrafik({ aylar }: { aylar: YillikAy[] }) {
  const maksDeger = Math.max(1, ...aylar.flatMap((a) => [a.gelir, a.gider]));

  const genislik = 760;
  const yukseklik = 260;
  const ustBosluk = 12;
  const altBosluk = 28;
  const solBosluk = 4;
  const sagBosluk = 4;

  const cizimYuksekligi = yukseklik - ustBosluk - altBosluk;
  const grupGenisligi = (genislik - solBosluk - sagBosluk) / aylar.length;
  const cubukGenisligi = grupGenisligi * 0.32;
  const cubukAraligi = 3;

  const paraKisa = (tutar: number) =>
    tutar.toLocaleString("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
  const paraTam = (tutar: number) =>
    tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

  const yuksekligiHesapla = (deger: number) => (deger / maksDeger) * cizimYuksekligi;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#008300]" />
          Gelir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-[#e34948] dark:bg-[#e66767]" />
          Gider
        </span>
      </div>

      <svg viewBox={`0 0 ${genislik} ${yukseklik}`} className="w-full" role="img" aria-label="Yıllık gelir/gider grafiği">
        {[0, 0.25, 0.5, 0.75, 1].map((oran) => {
          const y = ustBosluk + cizimYuksekligi * (1 - oran);
          return (
            <line
              key={oran}
              x1={solBosluk}
              y1={y}
              x2={genislik - sagBosluk}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
          );
        })}

        {aylar.map((ay, i) => {
          const grupX = solBosluk + i * grupGenisligi;
          const merkezX = grupX + grupGenisligi / 2;
          const gelirX = merkezX - cubukAraligi / 2 - cubukGenisligi;
          const giderX = merkezX + cubukAraligi / 2;

          const gelirYuk = yuksekligiHesapla(ay.gelir);
          const giderYuk = yuksekligiHesapla(ay.gider);
          const taban = ustBosluk + cizimYuksekligi;

          return (
            <g key={ay.ay}>
              <rect
                x={gelirX}
                y={taban - gelirYuk}
                width={cubukGenisligi}
                height={Math.max(gelirYuk, 1)}
                rx={2}
                fill="#008300"
              >
                <title>
                  {ay.ayEtiketi} · Gelir {paraTam(ay.gelir)} · {ay.seansSayisi} seans
                </title>
              </rect>
              <rect
                x={giderX}
                y={taban - giderYuk}
                width={cubukGenisligi}
                height={Math.max(giderYuk, 1)}
                rx={2}
                className="fill-[#e34948] dark:fill-[#e66767]"
              >
                <title>
                  {ay.ayEtiketi} · Gider {paraTam(ay.gider)} · {ay.seansSayisi} seans
                </title>
              </rect>
              <text
                x={merkezX}
                y={yukseklik - 8}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="text-muted-foreground"
              >
                {ay.ayEtiketi.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-xs text-muted-foreground">
        Yıl toplamı: Gelir {paraKisa(aylar.reduce((acc, a) => acc + a.gelir, 0))}₺ · Gider{" "}
        {paraKisa(aylar.reduce((acc, a) => acc + a.gider, 0))}₺ · Bir çubuğun üzerine gelerek ay
        detayını görebilirsiniz.
      </p>
    </div>
  );
}
