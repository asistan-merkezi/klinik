"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Trash2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DONEM_AY_SECENEKLERI } from "@/types/kamusal-odeme";
import type { DonemModu } from "@/lib/finans/donem";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const ayEtiket = (ay: number) => DONEM_AY_SECENEKLERI.find((s) => s.value === ay)?.label ?? String(ay);

/**
 * `tarih` alanları HER ZAMAN saf "YYYY-MM-DD" İstanbul takvim günü (sayfalar timestamptz
 * kaynaklarını da bu şekle normalize ediyor) — bu yüzden lib/datetime.ts'teki formatDate
 * KULLANILMAZ; düz string parçalama tek doğru/timezone'suz yöntem.
 */
function tarihEtiketi(gununTarihi: string): string {
  const [yil, ay, gun] = gununTarihi.split("-");
  return `${gun}.${ay}.${yil}`;
}

type YonluSatir = LedgerSatiri & { yon: "gelen" | "giden" };

type Grup = {
  anahtar: string;
  etiket: string;
  gelen: number;
  giden: number;
  bakiye: number;
  kalemler: YonluSatir[];
};

/**
 * Kasa / Banka / Kredi Kartı için ortak dönem görünümü.
 *
 * Dönem (mod/yıl/ay) URL'de ve sunucuda çözülür; `gelenRows`/`gidenRows` yalnızca SEÇİLİ
 * dönemin satırlarıdır, `openingBalance` ise dönemden ÖNCEKİ her şeyin veritabanında (SUM)
 * hesaplanmış net toplamıdır. Burada hiçbir şey tarihe göre süzülmez/ön bakiyeye eklenmez.
 * Dönem değişince `router.push` ile sunucudan yeniden çekilir.
 */
export function LedgerView({
  gelenRows,
  gidenRows,
  openingBalance,
  mod,
  yil,
  ay,
  yol,
  gelenEtiket = "Tahsilat",
  gidenEtiket = "Ödenen Gider",
  onEk,
  onSil,
}: {
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  openingBalance: number;
  mod: DonemModu;
  yil: number;
  /** 1-12 */
  ay: number;
  /** Sayfa yolu, örn. "/panel/finans/kasa" — dönem değişiminde `?mod=&yil=&ay=` eklenir. */
  yol: string;
  gelenEtiket?: string;
  gidenEtiket?: string;
  /** Kart başlıklarına ön ek: "Nakit" → "Toplam Nakit Tahsilat" */
  onEk?: string;
  /** Verilirse, `sil` alanı dolu satırlarda silme ikonu çıkar (yalnız yetkili kullanıcıya verilmeli). */
  onSil?: (sil: NonNullable<LedgerSatiri["sil"]>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [yukleniyor, startGecis] = useTransition();
  const [acikSatirlar, setAcikSatirlar] = useState<Set<string>>(new Set());
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [siliniyor, startSilme] = useTransition();

  function git(yeniMod: DonemModu, yeniYil: number, yeniAy: number) {
    setAcikSatirlar(new Set());
    startGecis(() => router.push(`${yol}?mod=${yeniMod}&yil=${yeniYil}&ay=${yeniAy}`));
  }

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
    git("aylik", yeniYil, yeniAy);
  }

  const { gruplar, gelenToplam, gidenToplam } = useMemo(() => {
    const map = new Map<string, Grup>();
    const kalemler: YonluSatir[] = [
      ...gelenRows.map((r) => ({ ...r, yon: "gelen" as const })),
      ...gidenRows.map((r) => ({ ...r, yon: "giden" as const })),
    ];
    for (const k of kalemler) {
      const anahtar = mod === "aylik" ? k.tarih : k.tarih.slice(0, 7);
      let grup = map.get(anahtar);
      if (!grup) {
        grup = {
          anahtar,
          etiket: mod === "aylik" ? tarihEtiketi(anahtar) : `${ayEtiket(Number(anahtar.slice(5, 7)))} ${anahtar.slice(0, 4)}`,
          gelen: 0,
          giden: 0,
          bakiye: 0,
          kalemler: [],
        };
        map.set(anahtar, grup);
      }
      if (k.yon === "gelen") grup.gelen += k.tutar;
      else grup.giden += k.tutar;
      grup.kalemler.push(k);
    }

    const sirali = Array.from(map.values()).sort((a, b) => a.anahtar.localeCompare(b.anahtar));
    let kosan = openingBalance;
    let gelen = 0;
    let giden = 0;
    // .map() yerine for-of: kapanmış değişkeni her iterasyonda yeniden atayan .map()
    // callback'i react-hooks/immutability kuralına takılıyor.
    for (const g of sirali) {
      kosan += g.gelen - g.giden;
      g.bakiye = kosan;
      g.kalemler.sort((a, b) => a.tarih.localeCompare(b.tarih));
      gelen += g.gelen;
      giden += g.giden;
    }
    return { gruplar: sirali, gelenToplam: gelen, gidenToplam: giden };
  }, [gelenRows, gidenRows, mod, openingBalance]);

  const donemSonuBakiye = openingBalance + gelenToplam - gidenToplam;
  const onEkMetni = onEk ? `${onEk} ` : "";
  const silmeSutunu = Boolean(onSil) && gruplar.some((g) => g.kalemler.some((k) => k.sil));

  function satirAcKapa(anahtar: string) {
    setAcikSatirlar((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(anahtar)) yeni.delete(anahtar);
      else yeni.add(anahtar);
      return yeni;
    });
  }

  function sil(hedef: NonNullable<LedgerSatiri["sil"]>) {
    startSilme(async () => {
      await onSil?.(hedef);
      setSilinecekId(null);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", yukleniyor && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mod} onValueChange={(v) => git(v as DonemModu, yil, ay)}>
          <TabsList>
            <TabsTrigger value="aylik">Aylık</TabsTrigger>
            <TabsTrigger value="yillik">Yıllık</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {mod === "aylik" ? (
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
              <Button type="button" variant="outline" size="icon-sm" onClick={() => git("yillik", yil - 1, ay)} aria-label="Önceki yıl">
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center text-sm font-medium">{yil}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => git("yillik", yil + 1, ay)} aria-label="Sonraki yıl">
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
            <p className="text-lg font-semibold tabular-nums">{paraFormat(openingBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Toplam {onEkMetni}{gelenEtiket}</p>
            <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{paraFormat(gelenToplam)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Toplam {onEkMetni}{gidenEtiket}</p>
            <p className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">{paraFormat(gidenToplam)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Dönem Sonu Bakiye</p>
            <p className="text-lg font-semibold tabular-nums text-primary">{paraFormat(donemSonuBakiye)}</p>
          </CardContent>
        </Card>
      </div>

      {gruplar.length === 0 ? (
        <EmptyState icon={Wallet} title="Bu dönemde hareket yok." compact />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_7rem_7rem_8rem] gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Tarih</span>
              <span className="text-right">{gelenEtiket}</span>
              <span className="text-right">{gidenEtiket}</span>
              <span className="text-right">Bakiye</span>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {gruplar.map((grup) => {
                const acik = acikSatirlar.has(grup.anahtar);
                return (
                  <Fragment key={grup.anahtar}>
                    <button
                      type="button"
                      onClick={() => satirAcKapa(grup.anahtar)}
                      aria-expanded={acik}
                      className="grid w-full grid-cols-[1fr_7rem_7rem_8rem] items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !acik && "-rotate-90")} />
                        {grup.etiket}
                      </span>
                      <span className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {grup.gelen > 0 ? `+${paraFormat(grup.gelen)}` : "—"}
                      </span>
                      <span className="text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {grup.giden > 0 ? `−${paraFormat(grup.giden)}` : "—"}
                      </span>
                      <span className="text-right font-semibold tabular-nums">{paraFormat(grup.bakiye)}</span>
                    </button>
                    {acik && (
                      <div className="border-t border-border bg-muted/20 px-2 py-2 sm:px-3">
                        <Table className="min-w-[560px]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead>Tarih</TableHead>
                              <TableHead>Tür</TableHead>
                              <TableHead>Karşı Taraf</TableHead>
                              <TableHead>Açıklama</TableHead>
                              <TableHead className="text-right">Tutar</TableHead>
                              {silmeSutunu && <TableHead />}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {grup.kalemler.map((k) => (
                              <TableRow key={`${k.yon}-${k.id}`}>
                                <TableCell className="text-muted-foreground">{tarihEtiketi(k.tarih)}</TableCell>
                                <TableCell>{k.etiket}</TableCell>
                                <TableCell className="text-muted-foreground">{k.taraf ?? "—"}</TableCell>
                                <TableCell className="max-w-56 truncate text-muted-foreground" title={k.aciklama}>
                                  {k.aciklama ?? "—"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right tabular-nums",
                                    k.yon === "gelen" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                  )}
                                >
                                  {k.yon === "gelen" ? "+" : "−"}
                                  {paraFormat(k.tutar)}
                                </TableCell>
                                {silmeSutunu && (
                                  <TableCell className="text-right">
                                    {k.sil &&
                                      (silinecekId === k.sil.id ? (
                                        <div className="flex items-center justify-end gap-1.5">
                                          <Button type="button" size="sm" variant="destructive" disabled={siliniyor} onClick={() => sil(k.sil!)}>
                                            Sil
                                          </Button>
                                          <Button type="button" size="sm" variant="outline" disabled={siliniyor} onClick={() => setSilinecekId(null)}>
                                            Vazgeç
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Sil" onClick={() => setSilinecekId(k.sil!.id)}>
                                          <Trash2 />
                                        </Button>
                                      ))}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
