"use client";

import { useActionState, useId, useState } from "react";
import { ShoppingCart, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HastaArama } from "@/app/(app)/panel/randevular/hasta-arama";
import { odemeAl } from "@/app/(app)/panel/hastalar/[id]/actions";
import { cn } from "@/lib/utils";
import type { PaketSatir, SatisHastaSecenegi } from "@/types/paket";
import type { HastaKategori } from "@/types/hasta";

const KATEGORI_ETIKETLERI: Record<HastaKategori, string> = {
  vita: "Vita",
  plus: "Plus",
  elit: "Elit",
  prime: "Prime",
};

export function PaketSatisDialog({
  paket,
  hastalar,
  className,
  varsayilanHasta,
  mod = "satis",
}: {
  paket: PaketSatir;
  hastalar?: SatisHastaSecenegi[];
  className?: string;
  /** Doluysa hasta arama gösterilmez, doğrudan bu hastaya satış yapılır (Yenile akışı). */
  varsayilanHasta?: SatisHastaSecenegi;
  mod?: "satis" | "yenile";
}) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [seciliHasta, setSeciliHasta] = useState<SatisHastaSecenegi | null>(varsayilanHasta ?? null);
  const [iskontoMetni, setIskontoMetni] = useState("");

  const satisAction = odemeAl.bind(null, seciliHasta?.id ?? "");
  const [durum, formAction, isPending] = useActionState(satisAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setSeciliHasta(varsayilanHasta ?? null);
      setIskontoMetni("");
    }
  }

  const iskontoSayi = iskontoMetni.trim() === "" ? 0 : Number(iskontoMetni);
  const iskontoGecerli = Number.isFinite(iskontoSayi) && iskontoSayi >= 0 && iskontoSayi <= paket.fiyat;
  const netTutar = iskontoGecerli ? paket.fiyat - iskontoSayi : paket.fiyat;

  const kalemlerJson = JSON.stringify([{ tur: "paket", ref_id: paket.id, miktar: 1 }]);
  // odemeAl'ın satirlar_json zorunluluğunu karşılamak için gönderiliyor —
  // odeme_olustur RPC'si sadece paket kalemi içeren çağrılarda bunu artık
  // yok sayıyor (ödeme girilmiyor, borç ekleniyor).
  const satirlarJson = JSON.stringify([{ yontem: "nakit", tutar: netTutar }]);

  function kapat(acikMi: boolean) {
    setAcik(acikMi);
    if (!acikMi) {
      setSeciliHasta(varsayilanHasta ?? null);
      setIskontoMetni("");
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(className)}
        title={mod === "yenile" ? "Bu paketi bu hastaya yeniden sat" : "Bu paketi bir hastaya sat"}
        onClick={() => setAcik(true)}
      >
        {mod === "yenile" ? <RefreshCw /> : <ShoppingCart />}
        {mod === "yenile" ? "Yenile" : "Satış"}
      </Button>

      <Dialog open={acik} onOpenChange={kapat}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mod === "yenile" ? "Paketi Yenile" : "Paket Sat"}: {paket.ad}</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="kalemler_json" value={kalemlerJson} />
            <input type="hidden" name="satirlar_json" value={satirlarJson} />

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-hasta`}>Hasta</Label>
              {varsayilanHasta ? (
                <p className="text-sm font-medium">{varsayilanHasta.ad}</p>
              ) : (
                <HastaArama
                  id={`${idOnEki}-hasta`}
                  hastalar={hastalar ?? []}
                  required
                  disabled={isPending}
                  onSecim={(hasta) => setSeciliHasta(hasta)}
                  onTemizle={() => setSeciliHasta(null)}
                />
              )}
            </div>

            {seciliHasta && (
              <div className="flex flex-col gap-1">
                <Label>Kategori</Label>
                <p className="text-sm text-muted-foreground">{KATEGORI_ETIKETLERI[seciliHasta.kategori]}</p>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label>Paket Fiyatı</Label>
              <p className="text-sm text-muted-foreground">
                {paket.fiyat.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-iskonto`}>İskonto Tutarı (₺)</Label>
              <Input
                id={`${idOnEki}-iskonto`}
                name="iskonto_tutari"
                type="number"
                min={0}
                max={paket.fiyat}
                step="0.01"
                value={iskontoMetni}
                onChange={(e) => setIskontoMetni(e.target.value)}
                disabled={isPending}
              />
              {!iskontoGecerli && iskontoMetni.trim() !== "" && (
                <p className="text-xs text-destructive">İskonto, paket fiyatını geçemez.</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label>Net Borç Tutarı</Label>
              <p className="text-sm font-medium">
                {netTutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
              </p>
              <p className="text-xs text-muted-foreground">
                Ödeme alınmaz — bu tutar hastanın bakiyesine borç olarak eklenir.
              </p>
            </div>

            {durum && (
              <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending || !seciliHasta || !iskontoGecerli} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
