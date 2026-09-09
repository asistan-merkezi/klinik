"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { KlinikArac } from "@/types/klinik";
import {
  ODEME_TIPI_ETIKET,
  DURUM_ETIKET,
  DONEM_AY_SECENEKLERI,
  type KamusalOdemeSatir,
  type KamusalOdemeDurum,
} from "@/types/kamusal-odeme";
import { OdemeFormu } from "./odeme-formu";
import { kamusalOdemeGuncelle, kamusalOdemeSil } from "./actions";

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

const tarihFormat = (tarih: string | null) => (tarih ? new Date(tarih).toLocaleDateString("tr-TR") : "—");

const donemFormat = (ay: number, yil: number) =>
  `${DONEM_AY_SECENEKLERI.find((s) => s.value === ay)?.label ?? ay} ${yil}`;

const DURUM_TON: Record<KamusalOdemeDurum, StatusTone> = {
  odendi: "emerald",
  bekliyor: "amber",
  gecikti: "rose",
};

export type KamusalOdemeSatirDurumlu = KamusalOdemeSatir & { durum: KamusalOdemeDurum };

export function OdemeTablosu({
  satirlar,
  yonetici,
  araclar,
}: {
  satirlar: KamusalOdemeSatirDurumlu[];
  yonetici: boolean;
  araclar: KlinikArac[];
}) {
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const duzenlenenSatir = satirlar.find((s) => s.id === duzenlenenId) ?? null;
  const aracMap = new Map(araclar.map((a) => [a.id, a]));

  return (
    <>
      <Table className="min-w-[800px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Ödeme Tipi</TableHead>
            <TableHead>Araç</TableHead>
            <TableHead>Dönem</TableHead>
            <TableHead className="text-right">Tutar</TableHead>
            <TableHead>Vade</TableHead>
            <TableHead>Ödeme Tarihi</TableHead>
            <TableHead>Durum</TableHead>
            {yonetici && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {satirlar.map((satir) => (
            <TableRow key={satir.id}>
              <TableCell className="font-medium">{ODEME_TIPI_ETIKET[satir.odeme_tipi]}</TableCell>
              <TableCell className="text-muted-foreground">
                {satir.arac_id ? aracMap.get(satir.arac_id)?.plaka ?? "—" : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{donemFormat(satir.donem_ay, satir.donem_yil)}</TableCell>
              <TableCell className="text-right tabular-nums">{paraFormat(satir.tutar)}</TableCell>
              <TableCell className="text-muted-foreground">{tarihFormat(satir.vade_tarihi)}</TableCell>
              <TableCell className="text-muted-foreground">{tarihFormat(satir.odeme_tarihi)}</TableCell>
              <TableCell>
                <StatusBadge tone={DURUM_TON[satir.durum]}>{DURUM_ETIKET[satir.durum]}</StatusBadge>
              </TableCell>
              {yonetici && (
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
                            await kamusalOdemeSil(satir.id);
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
                        aria-label="Ödemeyi düzenle"
                        onClick={() => setDuzenlenenId(satir.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Ödemeyi sil"
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

      <Dialog open={duzenlenenSatir != null} onOpenChange={(acik) => !acik && setDuzenlenenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödemeyi Düzenle</DialogTitle>
          </DialogHeader>
          {duzenlenenSatir && (
            <OdemeFormu
              key={duzenlenenSatir.id}
              action={kamusalOdemeGuncelle.bind(null, duzenlenenSatir.id)}
              gonderButonEtiketi="Güncelle"
              duzenlenecek={duzenlenenSatir}
              araclar={araclar}
              basariliOlunca={() => setDuzenlenenId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
