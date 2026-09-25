"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DONEM_AY_SECENEKLERI } from "@/types/kamusal-odeme";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const ayEtiket = (ay: number) => DONEM_AY_SECENEKLERI.find((s) => s.value === ay)?.label ?? String(ay);

/**
 * `tarih` alanları burada HER ZAMAN saf "YYYY-MM-DD" takvim tarihi (çağıran
 * sayfalar timestamptz kaynaklarını da bu şekle normalize ediyor) — bu yüzden
 * lib/datetime.ts'teki formatDate KULLANILMAZ (o, UTC ISO bekleyip
 * İstanbul'a çeviriyor; saf bir tarihe uygulanırsa `new Date(...)` UTC
 * gece yarısı varsayıp yanlış güne kayabilir). Düz string parçalama tek
 * doğru/timezone'suz yöntem.
 */
function tarihEtiketi(gununTarihi: string): string {
  const [yil, ay, gun] = gununTarihi.split("-");
  return `${gun}.${ay}.${yil}`;
}

type DonemModu = "aylik" | "yillik";

type SatirOzet = {
  anahtar: string;
  etiket: string;
  gelen: number;
  giden: number;
  bakiye: number;
  kalemler: (LedgerSatiri & { yon: "gelen" | "giden" })[];
};

function gruplaVeTopla(rows: (LedgerSatiri & { yon: "gelen" | "giden" })[], anahtarUret: (tarih: string) => string) {
  const map = new Map<string, SatirOzet>();
  for (const r of rows) {
    const anahtar = anahtarUret(r.tarih);
    if (!map.has(anahtar)) {
      map.set(anahtar, { anahtar, etiket: anahtar, gelen: 0, giden: 0, bakiye: 0, kalemler: [] });
    }
    const grup = map.get(anahtar)!;
    if (r.yon === "gelen") grup.gelen += r.tutar;
    else grup.giden += r.tutar;
    grup.kalemler.push(r);
  }
  return map;
}

function partiOzeti(kalemler: LedgerSatiri[]): string | null {
  if (kalemler.length === 0) return null;
  const sayac = new Map<string, number>();
  for (const k of kalemler) {
    const isim = k.taraf ?? k.etiket;
    sayac.set(isim, (sayac.get(isim) ?? 0) + 1);
  }
  return Array.from(sayac.entries())
    .map(([isim, adet]) => (adet > 1 ? `${isim} (${adet})` : isim))
    .join(", ");
}

export function LedgerView({
  gelenRows,
  gidenRows,
  openingBalance,
  yil,
  onYilDegistir,
}: {
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  openingBalance: number;
  /**
   * Gösterilen yıl artık burada değil, çağıran server component'te (bkz.
   * kasa/page.tsx, banka/page.tsx ?yil= parametresi) belirleniyor — gelenRows/
   * gidenRows sadece BU yılın detayını içeriyor (tüm ömür boyu geçmiş yerine),
   * "dönem başı bakiye" ise `openingBalance` üzerinden zaten bu yıldan ÖNCEKİ
   * her şeyi kapsayacak şekilde hesaplanmış geliyor. Yıl değiştiğinde veri
   * yeniden sunucudan çekilmesi gerektiği için bu artık local state değil,
   * kontrollü bir prop.
   */
  yil: number;
  onYilDegistir: (yeniYil: number) => void;
}) {
  const simdi = new Date();
  const [donemModu, setDonemModu] = useState<DonemModu>("aylik");
  const [ay, setAy] = useState(simdi.getMonth() + 1);
  const [acikSatirlar, setAcikSatirlar] = useState<Set<string>>(new Set());

  const tumKalemler = useMemo<(LedgerSatiri & { yon: "gelen" | "giden" })[]>(
    () => [
      ...gelenRows.map((r) => ({ ...r, yon: "gelen" as const })),
      ...gidenRows.map((r) => ({ ...r, yon: "giden" as const })),
    ],
    [gelenRows, gidenRows]
  );

  function ayDegistir(delta: number) {
    let yeniAy = ay + delta;
    let yeniYil = yil;
    if (yeniAy > 12) {
      yeniAy = 1;
      yeniYil += 1;
    } else if (yeniAy < 1) {
      yeniAy = 12;
      yeniYil -= 1;
    }
    setAy(yeniAy);
    if (yeniYil !== yil) onYilDegistir(yeniYil);
  }

  const { donemBasiBakiye, satirOzetleri, donemGelenToplam, donemGidenToplam } = useMemo(() => {
    const donemBaslangic =
      donemModu === "aylik" ? `${yil}-${String(ay).padStart(2, "0")}-01` : `${yil}-01-01`;
    const donemBitis =
      donemModu === "aylik"
        ? ay === 12
          ? `${yil + 1}-01-01`
          : `${yil}-${String(ay + 1).padStart(2, "0")}-01`
        : `${yil + 1}-01-01`;

    let oncekiToplam = openingBalance;
    const donemIcindekiler: (LedgerSatiri & { yon: "gelen" | "giden" })[] = [];
    for (const k of tumKalemler) {
      if (k.tarih < donemBaslangic) {
        oncekiToplam += k.yon === "gelen" ? k.tutar : -k.tutar;
      } else if (k.tarih < donemBitis) {
        donemIcindekiler.push(k);
      }
    }

    const gruplar =
      donemModu === "aylik"
        ? gruplaVeTopla(donemIcindekiler, (t) => t)
        : gruplaVeTopla(donemIcindekiler, (t) => t.slice(0, 7));

    const siraliAnahtarlar = Array.from(gruplar.keys()).sort();
    let kosanBakiye = oncekiToplam;
    let gelenToplam = 0;
    let gidenToplam = 0;
    // .map() yerine for-of: React'ın render-saflığı kontrolü, kapanmış bir
    // değişkeni (kosanBakiye) her iterasyonda yeniden atayan bir .map()
    // callback'ini "saf değil" sayıp reddediyor (react-hooks/immutability).
    const ozetler: SatirOzet[] = [];
    for (const anahtar of siraliAnahtarlar) {
      const grup = gruplar.get(anahtar)!;
      kosanBakiye = kosanBakiye + grup.gelen - grup.giden;
      gelenToplam += grup.gelen;
      gidenToplam += grup.giden;
      ozetler.push({
        ...grup,
        etiket:
          donemModu === "aylik"
            ? tarihEtiketi(anahtar)
            : ayEtiket(Number(anahtar.slice(5, 7))),
        bakiye: kosanBakiye,
      });
    }

    return {
      donemBasiBakiye: oncekiToplam,
      satirOzetleri: ozetler,
      donemGelenToplam: gelenToplam,
      donemGidenToplam: gidenToplam,
    };
  }, [tumKalemler, donemModu, yil, ay, openingBalance]);

  const donemSonuBakiye = donemBasiBakiye + donemGelenToplam - donemGidenToplam;

  function satirAcKapa(anahtar: string) {
    setAcikSatirlar((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(anahtar)) yeni.delete(anahtar);
      else yeni.add(anahtar);
      return yeni;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={donemModu} onValueChange={(v) => setDonemModu(v as DonemModu)}>
          <TabsList>
            <TabsTrigger value="aylik">Aylık</TabsTrigger>
            <TabsTrigger value="yillik">Yıllık</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {donemModu === "aylik" ? (
            <>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => ayDegistir(-1)} aria-label="Önceki ay">
                <ChevronLeft />
              </Button>
              <span className="min-w-32 text-center text-sm font-medium">
                {ayEtiket(ay)} {yil}
              </span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => ayDegistir(1)} aria-label="Sonraki ay">
                <ChevronRight />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => onYilDegistir(yil - 1)} aria-label="Önceki yıl">
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center text-sm font-medium">{yil}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => onYilDegistir(yil + 1)} aria-label="Sonraki yıl">
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Dönem Başı Bakiye</p>
            <p className="text-lg font-semibold tabular-nums">{paraFormat(donemBasiBakiye)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Gelen</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {paraFormat(donemGelenToplam)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Giden</p>
            <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              {paraFormat(donemGidenToplam)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Dönem Sonu Bakiye</p>
            <p className="text-lg font-semibold tabular-nums text-primary">{paraFormat(donemSonuBakiye)}</p>
          </CardContent>
        </Card>
      </div>

      {satirOzetleri.length === 0 ? (
        <EmptyState icon={Wallet} title="Bu dönemde hareket yok." compact />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {satirOzetleri.map((satir) => {
            const acik = acikSatirlar.has(satir.anahtar);
            const ozet = partiOzeti(satir.kalemler);
            return (
              <div key={satir.anahtar}>
                <button
                  type="button"
                  onClick={() => satirAcKapa(satir.anahtar)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", acik && "rotate-180")} />
                      {satir.etiket}
                    </span>
                    <div className="flex items-center gap-4 text-sm tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {satir.gelen > 0 ? `+${paraFormat(satir.gelen)}` : "—"}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400">
                        {satir.giden > 0 ? `−${paraFormat(satir.giden)}` : "—"}
                      </span>
                      <span className="w-28 text-right font-semibold">{paraFormat(satir.bakiye)}</span>
                    </div>
                  </div>
                  {ozet && <p className="pl-5.5 text-xs text-muted-foreground">{ozet}</p>}
                </button>
                {acik && (
                  <div className="flex flex-col gap-1 border-t border-border bg-muted/20 px-3 py-2 pl-8">
                    {satir.kalemler.map((k, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">
                          {donemModu === "yillik" && `${tarihEtiketi(k.tarih)} — `}
                          {k.etiket}
                        </span>
                        <span className={cn("tabular-nums", k.yon === "gelen" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                          {k.yon === "gelen" ? "+" : "−"}
                          {paraFormat(k.tutar)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
