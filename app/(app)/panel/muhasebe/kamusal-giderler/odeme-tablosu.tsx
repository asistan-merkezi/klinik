"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
}: {
  satirlar: KamusalOdemeSatirDurumlu[];
  yonetici: boolean;
}) {
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const [silinecekId, setSilinecekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const duzenlenenSatir = satirlar.find((s) => s.id === duzenlenenId) ?? null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Ödeme Tipi</th>
            <th className="px-3 py-2 text-left font-medium">Dönem</th>
            <th className="px-3 py-2 text-right font-medium">Tutar</th>
            <th className="px-3 py-2 text-left font-medium">Vade</th>
            <th className="px-3 py-2 text-left font-medium">Ödeme Tarihi</th>
            <th className="px-3 py-2 text-left font-medium">Durum</th>
            {yonetici && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((satir) => (
            <tr key={satir.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 font-medium">{ODEME_TIPI_ETIKET[satir.odeme_tipi]}</td>
              <td className="px-3 py-2 text-muted-foreground">{donemFormat(satir.donem_ay, satir.donem_yil)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{paraFormat(satir.tutar)}</td>
              <td className="px-3 py-2 text-muted-foreground">{tarihFormat(satir.vade_tarihi)}</td>
              <td className="px-3 py-2 text-muted-foreground">{tarihFormat(satir.odeme_tarihi)}</td>
              <td className="px-3 py-2">
                <StatusBadge tone={DURUM_TON[satir.durum]}>{DURUM_ETIKET[satir.durum]}</StatusBadge>
              </td>
              {yonetici && (
                <td className="px-3 py-2">
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
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

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
              basariliOlunca={() => setDuzenlenenId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
