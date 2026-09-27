"use client";

import { useActionState, useId, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  faturaEksikAlanlariBul,
  FATURA_ALAN_ETIKETLERI,
  type FaturaBilgisiKontrol,
} from "@/lib/fatura/eksik-bilgi";
import type { FaturaSatir } from "@/types/odeme";
import { formatDateTime } from "@/lib/datetime";
import { finansBorcDuzenle } from "./actions";
import { FaturaDurumHucresi } from "./fatura-satiri";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export type FinansBorcSatiri = {
  id: string;
  hastaAdSoyad: string;
  islemAdi: string;
  terapistAdi: string | null;
  tutar: number;
  iskontoTutari: number;
  createdAt: string;
  fatura: FaturaSatir | null;
  faturaBilgisi: FaturaBilgisiKontrol;
};

export function FinansBorcSatiriBileseni({
  satir,
  duzenlenebilir,
}: {
  satir: FinansBorcSatiri;
  duzenlenebilir: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const netToplam = Math.max(satir.tutar - satir.iskontoTutari, 0);

  return (
    <>
      <TableRow
        className={duzenlenebilir ? "cursor-pointer hover:bg-muted/40" : ""}
        onClick={duzenlenebilir ? () => setAcik(true) : undefined}
      >
        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(satir.createdAt)}</TableCell>
        <TableCell className="font-medium">{satir.hastaAdSoyad}</TableCell>
        <TableCell className="text-muted-foreground">
          <div className="flex flex-col">
            <span className="text-foreground">{satir.islemAdi}</span>
            {satir.terapistAdi && <span className="text-xs">{satir.terapistAdi}</span>}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{paraFormat(satir.tutar)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {satir.iskontoTutari > 0 ? paraFormat(satir.iskontoTutari) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">{paraFormat(netToplam)}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {satir.fatura ? (
            <FaturaDurumHucresi
              faturaId={satir.fatura.id}
              durum={satir.fatura.durum}
              hataMesaji={satir.fatura.hata_mesaji}
              eArsivPdfUrl={satir.fatura.e_arsiv_pdf_url}
            />
          ) : (
            <StatusBadge tone="slate">Faturasız</StatusBadge>
          )}
        </TableCell>
      </TableRow>

      {duzenlenebilir && <BorcDuzenleDialog acik={acik} onOpenChange={setAcik} satir={satir} />}
    </>
  );
}

function BorcDuzenleDialog({
  acik,
  onOpenChange,
  satir,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  satir: FinansBorcSatiri;
}) {
  const idOnEki = useId();
  const duzenleAction = finansBorcDuzenle.bind(null, satir.id);
  const [durum, formAction, isPending] = useActionState(duzenleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [iskontoMetni, setIskontoMetni] = useState(satir.iskontoTutari > 0 ? String(satir.iskontoTutari) : "");
  const [faturali, setFaturali] = useState(false);
  const [aciklama, setAciklama] = useState("");

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onOpenChange(false);
    }
  }

  const iskonto = Number(iskontoMetni) || 0;
  const netToplam = Math.max(satir.tutar - iskonto, 0);
  const eksikAlanlar = faturaEksikAlanlariBul(satir.faturaBilgisi);
  const faturaEngelli = faturali && eksikAlanlar.length > 0;

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borç Satırını Düzenle</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {satir.hastaAdSoyad} — {satir.islemAdi}
              </span>
              <span className="font-medium whitespace-nowrap">{paraFormat(satir.tutar)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-iskonto`}>İskonto (₺)</Label>
            <Input
              id={`${idOnEki}-iskonto`}
              name="iskonto_tutari"
              type="number"
              min={0}
              max={satir.tutar}
              step="0.01"
              placeholder="0"
              value={iskontoMetni}
              onChange={(e) => setIskontoMetni(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`${idOnEki}-faturali`}
              name="faturali"
              type="checkbox"
              checked={faturali}
              onChange={(e) => setFaturali(e.target.checked)}
              disabled={isPending}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={`${idOnEki}-faturali`} className="font-normal">
              Fatura
            </Label>
          </div>

          {faturaEngelli && (
            <p role="alert" className="text-sm text-destructive">
              Fatura için eksik bilgi: {eksikAlanlar.map((a) => FATURA_ALAN_ETIKETLERI[a]).join(", ")}. Hastanın
              Kişisel Bilgiler sekmesinden tamamlayın.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
            <Input
              id={`${idOnEki}-aciklama`}
              name="aciklama"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex justify-between text-sm font-medium">
            <span>Net borç</span>
            <span>{paraFormat(netToplam)}</span>
          </div>

          {durum && !durum.success && (
            <p role="alert" className="text-sm text-destructive">
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending || faturaEngelli} className="w-fit">
            {isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
