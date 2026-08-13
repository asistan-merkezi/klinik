"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import {
  BOLUM_ETIKET,
  KANAL_ETIKET,
  KREDI_HAREKET_ETIKET,
  type MesajKanal,
  type MesajKrediHareketi,
  type MesajKullanimOzetSatir,
} from "@/types/mesajlasma";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");
const tarihSaatFormat = (tarih: string) => new Date(tarih).toLocaleString("tr-TR");

export function KrediDetay({
  kanal,
  bakiye,
  hareketler,
  kullanimOzet,
}: {
  kanal: MesajKanal;
  bakiye: number;
  hareketler: MesajKrediHareketi[];
  kullanimOzet: MesajKullanimOzetSatir[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Güncel Bakiye — {KANAL_ETIKET[kanal]}</p>
          <p className="text-3xl font-semibold tabular-nums">{bakiye}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Kredi Talebi</h2>
          <p className="text-sm text-muted-foreground">
            Kredi yükleme yetkisi platform yöneticisine ait — kendi kendinize kredi yükleyemezsiniz. İhtiyacınız
            olan kredi miktarını Destek üzerinden talep edebilirsiniz.
          </p>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link href="/panel/destek/talep-sikayetler">Kredi Talebi Oluştur</Link>}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kullanım Raporu</h2>
        <KullanimRaporu kullanimOzet={kullanimOzet} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Hareketleri</h2>
        {hareketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz kredi hareketi yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hareketler.map((hareket) => (
              <li key={hareket.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={hareket.tip === "dusum" ? "sky" : "emerald"}>
                      {KREDI_HAREKET_ETIKET[hareket.tip]}
                    </StatusBadge>
                    {hareket.aciklama && <span className="text-muted-foreground">{hareket.aciklama}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{tarihSaatFormat(hareket.created_at)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className={cn("tabular-nums font-medium", hareket.miktar < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {hareket.miktar > 0 ? `+${hareket.miktar}` : hareket.miktar}
                  </span>
                  {hareket.tutar != null && <span className="text-xs text-muted-foreground">{paraFormat(hareket.tutar)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Her ay ayrı, katlanır bir bölümde kendi günlük listesini gösterir — İş
 * Başvurusu arşivindeki (BasvuruArsivi/ArsivGrubu) ay/yıl gruplama deseniyle
 * birebir aynı yaklaşım, sabit bir gün aralığı filtresi yerine.
 */
function KullanimRaporu({ kullanimOzet }: { kullanimOzet: MesajKullanimOzetSatir[] }) {
  const aylar = useMemo(() => {
    const map = new Map<string, { etiket: string; satirlar: MesajKullanimOzetSatir[]; toplam: number }>();
    for (const satir of kullanimOzet) {
      const tarih = new Date(satir.tarih);
      const anahtar = `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}`;
      const etiket = tarih.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
      if (!map.has(anahtar)) map.set(anahtar, { etiket, satirlar: [], toplam: 0 });
      const grup = map.get(anahtar)!;
      grup.satirlar.push(satir);
      grup.toplam += satir.toplam_adet;
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([anahtar, grup]) => ({
        anahtar,
        ...grup,
        satirlar: grup.satirlar.sort((a, b) => b.tarih.localeCompare(a.tarih)),
      }));
  }, [kullanimOzet]);

  if (aylar.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz gönderim kaydı yok.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {aylar.map((ay) => (
        <AyGrubu key={ay.anahtar} etiket={ay.etiket} satirlar={ay.satirlar} toplam={ay.toplam} />
      ))}
    </div>
  );
}

function AyGrubu({
  etiket,
  satirlar,
  toplam,
}: {
  etiket: string;
  satirlar: MesajKullanimOzetSatir[];
  toplam: number;
}) {
  const [acik, setAcik] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
        aria-expanded={acik}
      >
        <span className="capitalize">{etiket}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {toplam} gönderim
          <ChevronDown className={cn("size-4 transition-transform", acik && "rotate-180")} aria-hidden />
        </span>
      </button>
      {acik && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Tarih</th>
                <th className="px-3 py-2 text-left font-medium">Bölüm</th>
                <th className="px-3 py-2 text-right font-medium">Adet</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr key={`${s.tarih}-${s.bolum}`} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted-foreground">{tarihFormat(s.tarih)}</td>
                  <td className="px-3 py-2">{BOLUM_ETIKET[s.bolum]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.toplam_adet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
