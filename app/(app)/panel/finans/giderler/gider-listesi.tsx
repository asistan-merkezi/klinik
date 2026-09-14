"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import { DONEM_AY_SECENEKLERI } from "@/types/kamusal-odeme";
import { HARCAMA_KATEGORI_ETIKET, ODEME_TIPI_ETIKET, type KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { GiderFormu } from "./gider-formu";
import { giderGuncelle, giderSil } from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");
const ayEtiket = (ay: number) => DONEM_AY_SECENEKLERI.find((s) => s.value === ay)?.label ?? String(ay);

type DonemModu = "aylik" | "yillik";

export function GiderListesi({
  satirlar,
  duzenlenebilir,
  araclar,
  bankaHesaplari,
}: {
  satirlar: KlinikHarcamaSatir[];
  duzenlenebilir: boolean;
  araclar: KlinikArac[];
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const simdi = new Date();
  const [donemModu, setDonemModu] = useState<DonemModu>("aylik");
  const [yil, setYil] = useState(simdi.getFullYear());
  const [ay, setAy] = useState(simdi.getMonth() + 1);
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtreliSatirlar = useMemo(() => {
    return satirlar
      .filter((s) => {
        const tarih = new Date(s.tarih);
        if (tarih.getFullYear() !== yil) return false;
        if (donemModu === "aylik" && tarih.getMonth() + 1 !== ay) return false;
        return true;
      })
      .sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
  }, [satirlar, donemModu, yil, ay]);

  const donemToplami = filtreliSatirlar.reduce((acc, s) => acc + s.tutar, 0);
  const duzenlenenSatir = satirlar.find((s) => s.id === duzenlenenId) ?? null;
  const aracMap = new Map(araclar.map((a) => [a.id, a]));
  const bankaMap = new Map(bankaHesaplari.map((b) => [b.id, b]));

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
    setYil(yeniYil);
  }

  function odemeTipiGoster(satir: KlinikHarcamaSatir) {
    if (!satir.odeme_tipi) {
      return <StatusBadge tone="amber">Ödeme tipi seçilmedi</StatusBadge>;
    }
    if (satir.odeme_tipi === "havale") {
      const banka = satir.banka_hesap_id ? bankaMap.get(satir.banka_hesap_id) : undefined;
      return <span>{`Havale${banka ? ` (${banka.banka_adi})` : ""}`}</span>;
    }
    return <span>{ODEME_TIPI_ETIKET[satir.odeme_tipi]}</span>;
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
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setYil((y) => y - 1)} aria-label="Önceki yıl">
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center text-sm font-medium">{yil}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => setYil((y) => y + 1)} aria-label="Sonraki yıl">
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Dönem Toplamı</p>
          <p className="text-2xl font-semibold text-primary">{paraFormat(donemToplami)}</p>
        </CardContent>
      </Card>

      {filtreliSatirlar.length === 0 ? (
        <EmptyState icon={Wallet} title="Bu dönemde gider kaydı yok." compact />
      ) : (
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Tarih</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Tedarikçi</TableHead>
              <TableHead>Açıklama</TableHead>
              <TableHead>Ödeme</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
              {duzenlenebilir && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtreliSatirlar.map((satir) => (
              <TableRow key={satir.id}>
                <TableCell className="text-muted-foreground">{tarihFormat(satir.tarih)}</TableCell>
                <TableCell>
                  <StatusBadge tone="slate">{HARCAMA_KATEGORI_ETIKET[satir.kategori]}</StatusBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {satir.tedarikci_adi ?? "—"}
                  {satir.arac_id && aracMap.get(satir.arac_id) && (
                    <span className="text-xs"> · {aracMap.get(satir.arac_id)?.plaka}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{satir.aciklama ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{odemeTipiGoster(satir)}</TableCell>
                <TableCell className="text-right tabular-nums">{paraFormat(satir.tutar)}</TableCell>
                {duzenlenebilir && (
                  <TableCell>
                    {silinecekId === satir.id ? (
                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        <span className="text-muted-foreground">Silinsin mi?</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              await giderSil(satir.id);
                              setSilinecekId(null);
                            })
                          }
                        >
                          Sil
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => setSilinecekId(null)}
                        >
                          Vazgeç
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Gideri düzenle"
                          onClick={() => setDuzenlenenId(satir.id)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Gideri sil"
                          onClick={() => setSilinecekId(satir.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={duzenlenenSatir != null} onOpenChange={(acik) => !acik && setDuzenlenenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gideri Düzenle</DialogTitle>
          </DialogHeader>
          {duzenlenenSatir && (
            <GiderFormu
              key={duzenlenenSatir.id}
              action={giderGuncelle.bind(null, duzenlenenSatir.id)}
              gonderButonEtiketi="Güncelle"
              duzenlenecek={duzenlenenSatir}
              araclar={araclar}
              bankaHesaplari={bankaHesaplari}
              basariliOlunca={() => setDuzenlenenId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
