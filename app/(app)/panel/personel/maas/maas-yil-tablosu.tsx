"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type MaasYilPersonel = {
  gorev: string;
  maas: number | null;
  ise_giris_tarihi: string | null;
};

const AY_KISALTMALARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

/** O yılın verilen ayında personelin sabit maaşı tahakkuk etmiş mi (henüz işe girmemişse veya ay henüz gelmemişse 0). */
function aySabitMaas(p: MaasYilPersonel, yil: number, ayIndex: number): number {
  if (!p.maas) return 0;

  const bugun = new Date();
  const buAyBaslangic = new Date(bugun.getFullYear(), bugun.getMonth(), 1);
  const ayBaslangic = new Date(yil, ayIndex, 1);
  if (ayBaslangic > buAyBaslangic) return 0;

  if (p.ise_giris_tarihi) {
    const ayBitis = new Date(yil, ayIndex + 1, 0);
    if (new Date(p.ise_giris_tarihi) > ayBitis) return 0;
  }

  return p.maas;
}

export function PersonelMaasYilTablosu({
  personelListesi,
  yil,
  yilSecenekleri,
}: {
  personelListesi: MaasYilPersonel[];
  yil: number;
  yilSecenekleri: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const gruplar = useMemo(() => {
    const map = new Map<string, MaasYilPersonel[]>();
    for (const p of personelListesi) {
      const liste = map.get(p.gorev) ?? [];
      liste.push(p);
      map.set(p.gorev, liste);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => {
        const aylik = AY_KISALTMALARI.map((_, i) => liste.reduce((acc, p) => acc + aySabitMaas(p, yil, i), 0));
        return { gorev, aylik, yilToplam: aylik.reduce((a, b) => a + b, 0) };
      });
  }, [personelListesi, yil]);

  const genelToplam = useMemo(
    () =>
      AY_KISALTMALARI.map((_, i) => gruplar.reduce((acc, g) => acc + g.aylik[i], 0)).reduce(
        (acc, ayToplam) => acc + ayToplam,
        0
      ),
    [gruplar]
  );

  function yilDegistir(yeniYil: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("yil", yeniYil);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Kategori bazlı sabit maaş toplamları.</p>
        <select
          value={yil}
          onChange={(e) => yilDegistir(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          {yilSecenekleri.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {gruplar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz personel kaydı yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Kategori</th>
                {AY_KISALTMALARI.map((ay) => (
                  <th key={ay} className="px-2 py-2 text-right font-medium">
                    {ay}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Yıl Toplamı</th>
              </tr>
            </thead>
            <tbody>
              {gruplar.map(({ gorev, aylik, yilToplam }) => (
                <tr key={gorev} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{gorev}</td>
                  {aylik.map((tutar, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">
                      {tutar > 0 ? paraFormat(tutar) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{paraFormat(yilToplam)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td className="px-3 py-2 font-semibold">Genel Toplam</td>
                {AY_KISALTMALARI.map((_, i) => (
                  <td key={i} className="px-2 py-2 text-right font-semibold tabular-nums">
                    {paraFormat(gruplar.reduce((acc, g) => acc + g.aylik[i], 0))}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{paraFormat(genelToplam)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
