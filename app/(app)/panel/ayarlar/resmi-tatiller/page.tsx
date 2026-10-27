import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { BAYRAM_ADLARI, tatilTarihiGoster, type Bayram } from "@/lib/tatil/kurallar";
import { resmiTatilUyarilariGetir } from "@/lib/tatil/durum";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BayramOnerisiKarti, KontrolEtDugmesi, TatilEkleFormu, TatilSilDugmesi } from "./resmi-tatiller-istemci";

type TatilSatiri = { id: string; klinik_id: string | null; tarih: string; ad: string };
type OneriSatiri = { yil: number; bayram: Bayram; tarih: string; ad: string };

export default async function ResmiTatillerSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { ctx, bag } = await panelBaglami();
  const yonetici = ctx.rol === "klinik_admin";

  const bugun = bugunIstanbulTarihi();
  const buYil = Number(bugun.slice(0, 4));
  const istenenYil = Number((await searchParams).yil);
  const yil = Number.isInteger(istenenYil) && istenenYil >= 2020 && istenenYil <= buYil + 5 ? istenenYil : buYil;

  const { tatilHam, oneriHam, uyarilar } = await withTenant(bag, async (tx) => ({
    tatilHam: (await tx
      .select({ id: sema.resmiTatil.id, klinik_id: sema.resmiTatil.klinikId, tarih: sema.resmiTatil.tarih, ad: sema.resmiTatil.ad })
      .from(sema.resmiTatil)
      .where(and(gte(sema.resmiTatil.tarih, `${yil}-01-01`), lt(sema.resmiTatil.tarih, `${yil + 1}-01-01`)))
      .orderBy(asc(sema.resmiTatil.tarih))) as TatilSatiri[],
    oneriHam: yonetici
      ? ((await tx
          .select({ yil: sema.resmiTatilOneri.yil, bayram: sema.resmiTatilOneri.bayram, tarih: sema.resmiTatilOneri.tarih, ad: sema.resmiTatilOneri.ad })
          .from(sema.resmiTatilOneri)
          .where(eq(sema.resmiTatilOneri.durum, "bekliyor"))
          .orderBy(asc(sema.resmiTatilOneri.tarih))) as OneriSatiri[])
      : ([] as OneriSatiri[]),
    uyarilar: yonetici ? await resmiTatilUyarilariGetir(tx) : [],
  }));

  const tatiller = tatilHam;
  const oneriGruplari = new Map<string, { yil: number; bayram: Bayram; gunler: { tarih: string; ad: string }[] }>();
  for (const o of oneriHam ?? []) {
    const anahtar = `${o.yil}|${o.bayram}`;
    const grup = oneriGruplari.get(anahtar) ?? { yil: o.yil, bayram: o.bayram, gunler: [] };
    grup.gunler.push({ tarih: o.tarih, ad: o.ad });
    oneriGruplari.set(anahtar, grup);
  }
  const eksikler = uyarilar.filter((u) => u.durum === "eksik");

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={CalendarDays}
          title="Resmi Tatiller"
          description="İzin gün sayısı ve Puantaj Cetveli bu günleri tatil sayar. Sabit tarihli tatiller her yıl otomatik eklenir; dini bayram tarihleri öneri olarak gelir ve onayınızla kesinleşir."
          actions={yonetici && <KontrolEtDugmesi />}
        />

        {yonetici && eksikler.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
            <StatusBadge tone="rose">Tarih girilmemiş</StatusBadge>
            <p>
              {eksikler.map((u) => `${u.ad} ${u.yil}`).join(", ")} için onaylı tarih yok — bu günler izin ve puantaj
              hesabında iş günü sayılır. &quot;Şimdi Kontrol Et&quot; ile öneri getirin ya da tarihleri aşağıdan elle
              ekleyin.
            </p>
          </div>
        )}

        {yonetici && oneriGruplari.size > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Onay Bekleyen Bayram Tarihleri</h2>
              <StatusBadge tone="amber">{oneriGruplari.size}</StatusBadge>
            </div>
            {[...oneriGruplari.values()].map((g) => (
              <BayramOnerisiKarti
                key={`${g.yil}-${g.bayram}`}
                yil={g.yil}
                bayram={g.bayram}
                baslik={BAYRAM_ADLARI[g.bayram]}
                gunler={g.gunler}
              />
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="tabular text-base font-semibold">{yil} Tatilleri</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Önceki yıl"
                nativeButton={false}
                render={
                  <Link href={`?yil=${yil - 1}`}>
                    <ChevronLeft />
                  </Link>
                }
              />
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Sonraki yıl"
                nativeButton={false}
                render={
                  <Link href={`?yil=${yil + 1}`}>
                    <ChevronRight />
                  </Link>
                }
              />
            </div>
          </div>

          {tatiller.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title={`${yil} için kayıtlı tatil yok.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tatil</TableHead>
                  <TableHead>Kaynak</TableHead>
                  {yonetici && <TableHead className="w-0" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tatiller.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="tabular whitespace-nowrap">{tatilTarihiGoster(t.tarih)}</TableCell>
                    <TableCell>{t.ad}</TableCell>
                    <TableCell>
                      <StatusBadge tone={t.klinik_id ? "teal" : "slate"}>{t.klinik_id ? "Klinik" : "Sistem"}</StatusBadge>
                    </TableCell>
                    {yonetici && <TableCell>{t.klinik_id && <TatilSilDugmesi id={t.id} />}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {yonetici && <TatilEkleFormu varsayilanTarih={yil === buYil ? bugun : `${yil}-01-01`} />}
        </section>
      </div>
    </div>
  );
}
