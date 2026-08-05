"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type MaasYilPersonel = {
  id: string;
  ad_soyad: string;
  gorev: string;
  maas: number | null;
  aktif: boolean;
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
  const [acikGorev, setAcikGorev] = useState<string | null>(null);

  const gruplar = useMemo(() => {
    const map = new Map<string, MaasYilPersonel[]>();
    for (const p of personelListesi) {
      const liste = map.get(p.gorev) ?? [];
      liste.push(p);
      map.set(p.gorev, liste);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => ({
        gorev,
        liste: liste.sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr")),
      }));
  }, [personelListesi]);

  function aylikToplamlar(liste: MaasYilPersonel[]) {
    const aylik = AY_KISALTMALARI.map((_, i) => liste.reduce((acc, p) => acc + aySabitMaas(p, yil, i), 0));
    return { aylik, yilToplam: aylik.reduce((a, b) => a + b, 0) };
  }

  function yilDegistir(yeniYil: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("yil", yeniYil);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Kategoriye tıklayınca personel bazlı döküm açılır.</p>
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
              {gruplar.map(({ gorev, liste }) => {
                const { aylik, yilToplam } = aylikToplamlar(liste);
                const acik = acikGorev === gorev;

                return (
                  <Fragment key={gorev}>
                    <tr
                      className="cursor-pointer border-b border-border transition-colors hover:bg-card/70"
                      onClick={() => setAcikGorev(acik ? null : gorev)}
                    >
                      <td className="px-3 py-2 font-medium">{gorev}</td>
                      {aylik.map((tutar, i) => (
                        <td key={i} className="px-2 py-2 text-right tabular-nums">
                          {tutar > 0 ? paraFormat(tutar) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{paraFormat(yilToplam)}</td>
                    </tr>
                    {acik &&
                      liste.map((p) => {
                        const aylikKisi = AY_KISALTMALARI.map((_, i) => aySabitMaas(p, yil, i));
                        const kisiToplam = aylikKisi.reduce((a, b) => a + b, 0);
                        return (
                          <tr key={p.id} className="border-b border-border/60 bg-muted/20 text-xs">
                            <td className="py-1.5 pr-3 pl-6">
                              <Link
                                href={`/panel/personel/${p.id}`}
                                className={cn(
                                  "hover:underline",
                                  !p.aktif && "text-muted-foreground line-through"
                                )}
                              >
                                {p.ad_soyad}
                              </Link>
                            </td>
                            {aylikKisi.map((tutar, i) => (
                              <td key={i} className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                                {tutar > 0 ? paraFormat(tutar) : "—"}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                              {paraFormat(kisiToplam)}
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
