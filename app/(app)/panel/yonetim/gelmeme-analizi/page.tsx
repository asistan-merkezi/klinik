import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX2, Clock, ListTodo, UserX } from "lucide-react";
import { withTenant, rpc } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  GELMEME_MIN_ORNEK,
  gelmemeAnaliziniHazirla,
  yuzdeFormat,
  type GelmemeRpcSatiri,
  type GelmemeSatiri,
} from "@/lib/randevu/gelmeme";

const GUN_SECENEKLERI = [30, 90, 180, 365] as const;
const AY_ETIKETI = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });

function ayEtiketi(anahtar: string) {
  const [y, a] = anahtar.split("-").map(Number);
  return AY_ETIKETI.format(new Date(Date.UTC(y, a - 1, 15)));
}

/**
 * Bir kırılım tablosu: satır başına sonuçlanan randevu, gelmeyen ve gelmeme oranı
 * (tek seri → tek renk çubuk, değer her satırda yazılı; çubuk tablodaki en yüksek
 * orana göre ölçeklenir ki farklar okunabilsin). Az verili satırlar soluk.
 */
function KirilimTablosu({
  baslik,
  aciklama,
  ilkKolon,
  satirlar,
  etiket = (s) => s.etiket,
}: {
  baslik: string;
  aciklama?: string;
  ilkKolon: string;
  satirlar: GelmemeSatiri[];
  etiket?: (s: GelmemeSatiri) => React.ReactNode;
}) {
  const enYuksek = Math.max(0.0001, ...satirlar.map((s) => s.gelmemeOrani ?? 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{baslik}</CardTitle>
        {aciklama && <CardDescription>{aciklama}</CardDescription>}
      </CardHeader>
      <CardContent>
        {satirlar.length === 0 ? (
          <EmptyState compact title="Bu dönemde veri yok." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ilkKolon}</TableHead>
                <TableHead className="text-right">Sonuçlanan</TableHead>
                <TableHead className="text-right">Gelmedi</TableHead>
                <TableHead className="w-[40%]">Gelmeme oranı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((s) => {
                const azVeri = s.sonuclanan < GELMEME_MIN_ORNEK;
                return (
                  <TableRow key={s.anahtar} className={cn(azVeri && "text-muted-foreground")}>
                    <TableCell className="font-medium">{etiket(s)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.sonuclanan}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.gelmedi}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2" title={`${s.gelmedi} / ${s.sonuclanan} randevu`}>
                        <ProgressBar value={s.gelmemeOrani ?? 0} max={enYuksek} className="flex-1" />
                        <span className="w-14 text-right text-xs font-medium tabular-nums">
                          {yuzdeFormat(s.gelmemeOrani)}
                        </span>
                      </div>
                      {azVeri && <p className="mt-0.5 text-[11px]">Az veri ({GELMEME_MIN_ORNEK} randevudan az)</p>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default async function GelmemeAnaliziSayfasi({ searchParams }: { searchParams: Promise<{ gun?: string }> }) {
  // Terapist ve hasta bazlı oranlar personel performansı / kişisel veridir: yalnız klinik_admin (ya da destek bağlamındaki super_admin).
  // Toplulaştırma SQL'dedir (gelmeme_analizi RPC'si TEK doğruluk kaynağı; RPC içinde de rol denetimi var); burada yalnız sunum.
  const { ctx, bag } = await panelBaglami();
  if (ctx.rol !== "klinik_admin" && ctx.rol !== "super_admin") redirect("/panel");
  const { gun: gunParam } = await searchParams;
  const gun = GUN_SECENEKLERI.find((g) => g === Number(gunParam)) ?? 90;

  const bitis = new Date();
  const baslangic = new Date(bitis.getTime() - gun * 24 * 60 * 60 * 1000);
  const data = await withTenant(bag, (tx) =>
    rpc<GelmemeRpcSatiri>(tx, "gelmeme_analizi", { p_baslangic: baslangic.toISOString(), p_bitis: bitis.toISOString() })
  );

  const analiz = gelmemeAnaliziniHazirla(data);
  const { toplam } = analiz;
  const isaretlenmemisOrani =
    toplam.sonuclanan + toplam.isaretlenmemis > 0
      ? toplam.isaretlenmemis / (toplam.sonuclanan + toplam.isaretlenmemis)
      : 0;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          title="Gelmeme Analizi"
          description="Saati geçmiş randevularda hastaların gelmeme oranı; terapist, saat, gün ve ay kırılımında. Hatırlatma mesajları devreye girdiğinde etkisi Aylık Eğilim'de izlenir."
          icon={UserX}
        />

        <div className="flex flex-wrap gap-2">
          {GUN_SECENEKLERI.map((g) => (
            <Link
              key={g}
              href={`/panel/yonetim/gelmeme-analizi${g === 90 ? "" : `?gun=${g}`}`}
              className={cn(buttonVariants({ variant: g === gun ? "default" : "outline", size: "sm" }), g !== gun && "text-muted-foreground")}
              aria-current={g === gun ? "true" : undefined}
            >
              Son {g} gün
            </Link>
          ))}
        </div>

        {toplam.sonuclanan + toplam.iptal + toplam.ertelendi + toplam.isaretlenmemis === 0 ? (
          <EmptyState icon={UserX} title={`Son ${gun} günde saati geçmiş randevu yok.`} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Gelmeme oranı"
                value={yuzdeFormat(toplam.gelmemeOrani)}
                icon={UserX}
                iconTone="amber"
                trend={`${toplam.gelmedi} / ${toplam.sonuclanan} sonuçlanan randevu`}
              />
              <KpiCard
                label="Geç gelme oranı"
                value={yuzdeFormat(toplam.gecikmeOrani)}
                icon={Clock}
                iconTone="sky"
                trend={`${toplam.gecikmeli} geç gelen`}
              />
              <KpiCard
                label="İptal / Ertelenen"
                value={`${toplam.iptal} / ${toplam.ertelendi}`}
                icon={CalendarX2}
                iconTone="violet"
                trend="Orana dahil değil"
              />
              <KpiCard
                label="Sonucu girilmemiş"
                value={toplam.isaretlenmemis}
                icon={ListTodo}
                iconTone="blue"
                trend={
                  isaretlenmemisOrani > 0.05
                    ? "Yüksek — oranlar eksik olabilir, randevu sonuçlarını girin"
                    : "Saati geçmiş, hâlâ 'planlandı'"
                }
              />
            </div>

            <KirilimTablosu
              baslik="Aylık Eğilim"
              aciklama="Hatırlatma mesajlarının etkisini görmek için ay ay karşılaştırın."
              ilkKolon="Ay"
              satirlar={analiz.ay}
              etiket={(s) => ayEtiketi(s.anahtar)}
            />

            <KirilimTablosu
              baslik="Terapist"
              aciklama="Gelmeme çoğunlukla hastaya bağlıdır; bu tablo terapist performansı değil, hangi takvimde boşluk oluştuğunu gösterir."
              ilkKolon="Terapist"
              satirlar={analiz.terapist}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <KirilimTablosu baslik="Saat" ilkKolon="Başlangıç saati" satirlar={analiz.saat} />
              <KirilimTablosu baslik="Haftanın Günü" ilkKolon="Gün" satirlar={analiz.gun} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Tekrarlayan Gelmeyenler</CardTitle>
                <CardDescription>Bu dönemde en az 2 kez gelmeyen hastalar (en çok 10).</CardDescription>
              </CardHeader>
              <CardContent>
                {analiz.hasta.length === 0 ? (
                  <EmptyState compact title="Tekrarlayan gelmeme yok." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hasta</TableHead>
                        <TableHead className="text-right">Gelmedi</TableHead>
                        <TableHead className="text-right">Geldi</TableHead>
                        <TableHead className="text-right">Oran</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analiz.hasta.map((h) => (
                        <TableRow key={h.anahtar}>
                          <TableCell>
                            <Link href={`/panel/hastalar/${h.anahtar}/randevu`} className="font-medium hover:underline">
                              {h.etiket}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{h.gelmedi}</TableCell>
                          <TableCell className="text-right tabular-nums">{h.gerceklesen}</TableCell>
                          <TableCell className="text-right tabular-nums">{yuzdeFormat(h.gelmemeOrani)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Gelmeme oranı = gelmeyen / (gerçekleşen + gelmeyen). İptal ve ertelemeler (hasta önceden haber vermiştir)
              ve saati geçip sonucu girilmemiş randevular orana dahil edilmez. Saat ve gün İstanbul saatine göredir.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
