"use client";

import { useActionState, useId, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { BAKIYE_HAREKET_ETIKETLERI, type BakiyeHareketTuru, type HastaBakiyeHareket } from "@/types/hasta-detay";
import type { BakiyeSatirGorunum } from "@/lib/hasta/bakiye-hareket-gorunum";
import {
  faturaEksikAlanlariBul,
  FATURA_ALAN_ETIKETLERI,
  type FaturaBilgisiKontrol,
} from "@/lib/fatura/eksik-bilgi";
import { borcKapat } from "./actions";
import { formatDate, formatTime } from "@/lib/datetime";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

const BAKIYE_HAREKET_TONLARI: Record<BakiyeHareketTuru, StatusTone> = {
  odeme: "emerald",
  kredi: "emerald",
  iade: "sky",
  borc: "rose",
};

export function BakiyeHareketSatiri({
  hastaId,
  satir,
  kategoriEtiketi,
  kategoriPct,
  duzenlenebilir,
  faturaBilgisi,
}: {
  hastaId: string;
  satir: BakiyeSatirGorunum;
  kategoriEtiketi: string;
  kategoriPct: number;
  duzenlenebilir: boolean;
  faturaBilgisi: FaturaBilgisiKontrol;
}) {
  const [acik, setAcik] = useState(false);
  const { hareket, islemAdi, terapistAdi, kategoriIskontoTutari, manuelIskontoTutari, tutarBrut, bakiyeSonrasi } = satir;
  const tikanabilir = satir.tip === "tekli" && duzenlenebilir && hareket.tur === "borc";

  // "İşlem" satırı: borç kapatılmış (eskiden borç, şimdi tur='odeme') bir
  // kaydın orijinal tedavi/tutar tarafı — Borç rengiyle (rose) aynı görsel
  // dilde kalıyor ki açık borçtan farklı bir kategoriymiş gibi görünmesin,
  // sadece artık tıklanamıyor (ödeme zaten yapılmış). Bakiye/İskonto bu
  // satırda gösterilmiyor, o bilgi "Ödeme" satırında.
  if (satir.tip === "islem") {
    return (
      <tr className="border-b border-border/60 align-top">
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(satir.tarih)}</td>
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatTime(satir.tarih)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{islemAdi}</span>
            <StatusBadge tone="rose" className="w-fit">
              Borç
            </StatusBadge>
            {hareket.aciklama && <span className="text-xs text-muted-foreground">{hareket.aciklama}</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{terapistAdi ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium">{paraFormat(tutarBrut)}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {kategoriIskontoTutari > 0 ? (
            <div className="flex flex-col items-end">
              <span>{paraFormat(kategoriIskontoTutari)}</span>
              <span className="text-xs text-muted-foreground">
                {kategoriEtiketi} %{kategoriPct}
              </span>
            </div>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {manuelIskontoTutari > 0 ? paraFormat(manuelIskontoTutari) : "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
      </tr>
    );
  }

  if (satir.tip === "odeme") {
    return (
      <tr className="border-b border-border last:border-b-0 align-top">
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(satir.tarih)}</td>
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatTime(satir.tarih)}</td>
        <td className="px-3 py-2">
          <StatusBadge tone="emerald" className="w-fit">
            Ödeme
          </StatusBadge>
        </td>
        <td className="px-3 py-2 text-muted-foreground">—</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
          +{paraFormat(hareket.tutar)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
        <td
          className={`px-3 py-2 text-right tabular-nums font-medium ${
            (bakiyeSonrasi ?? 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
          }`}
        >
          {paraFormat(bakiyeSonrasi ?? 0)}
        </td>
      </tr>
    );
  }

  const tonu = BAKIYE_HAREKET_TONLARI[hareket.tur];
  const isaret = hareket.tur === "borc" ? "-" : "+";

  return (
    <>
      <tr
        className={`border-b border-border last:border-b-0 align-top ${
          tikanabilir ? "cursor-pointer hover:bg-muted/40" : ""
        }`}
        onClick={tikanabilir ? () => setAcik(true) : undefined}
      >
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(satir.tarih)}</td>
        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatTime(satir.tarih)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{islemAdi}</span>
            <div className="flex flex-wrap items-center gap-1">
              <StatusBadge tone={tonu} className="w-fit">
                {BAKIYE_HAREKET_ETIKETLERI[hareket.tur]}
              </StatusBadge>
            </div>
            {hareket.aciklama && <span className="text-xs text-muted-foreground">{hareket.aciklama}</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-muted-foreground">{terapistAdi ?? "—"}</td>
        <td
          className={`px-3 py-2 text-right tabular-nums font-medium ${
            hareket.tur === "borc" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {isaret}
          {paraFormat(tutarBrut)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {kategoriIskontoTutari > 0 ? (
            <div className="flex flex-col items-end">
              <span>{paraFormat(kategoriIskontoTutari)}</span>
              <span className="text-xs text-muted-foreground">
                {kategoriEtiketi} %{kategoriPct}
              </span>
            </div>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {manuelIskontoTutari > 0 ? paraFormat(manuelIskontoTutari) : "—"}
        </td>
        <td
          className={`px-3 py-2 text-right tabular-nums font-medium ${
            (bakiyeSonrasi ?? 0) < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
          }`}
        >
          {paraFormat(bakiyeSonrasi ?? 0)}
        </td>
      </tr>

      {tikanabilir && (
        <BorcDuzenleDialog
          acik={acik}
          onOpenChange={setAcik}
          hastaId={hastaId}
          hareket={hareket}
          islemAdi={islemAdi}
          faturaBilgisi={faturaBilgisi}
        />
      )}
    </>
  );
}

function BorcDuzenleDialog({
  acik,
  onOpenChange,
  hastaId,
  hareket,
  islemAdi,
  faturaBilgisi,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  hastaId: string;
  hareket: HastaBakiyeHareket;
  islemAdi: string;
  faturaBilgisi: FaturaBilgisiKontrol;
}) {
  const idOnEki = useId();
  const kapatAction = borcKapat.bind(null, hastaId, hareket.id);
  const [durum, formAction, isPending] = useActionState(kapatAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [iskontoMetni, setIskontoMetni] = useState("");
  const [faturali, setFaturali] = useState(false);
  const [aciklama, setAciklama] = useState("");

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onOpenChange(false);
    }
  }

  const iskonto = Number(iskontoMetni) || 0;
  const netToplam = Math.max(hareket.tutar - iskonto, 0);
  const eksikAlanlar = faturaEksikAlanlariBul(faturaBilgisi);
  const faturaEngelli = faturali && eksikAlanlar.length > 0;

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borç Satırını Düzenle</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="yontem" value="nakit" />

          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{islemAdi}</span>
              <span className="font-medium">{paraFormat(hareket.tutar)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-iskonto`}>İskonto (₺)</Label>
            <Input
              id={`${idOnEki}-iskonto`}
              name="iskonto_tutari"
              type="number"
              min={0}
              max={hareket.tutar}
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
              Faturalı
            </Label>
          </div>

          {faturaEngelli && (
            <p role="alert" className="text-sm text-destructive">
              Fatura için eksik bilgi: {eksikAlanlar.map((a) => FATURA_ALAN_ETIKETLERI[a]).join(", ")}. Kişisel
              Bilgiler sekmesinden tamamlayın.
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
            <span>Tahsil edilecek</span>
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
