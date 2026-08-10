"use client";

import { useActionState, useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OdemeYontemi } from "@/types/odeme";
import { OdemeTipiSecici, ODEME_TIPI_ETIKETLERI, ODEME_TIPI_SECILI_SINIFI } from "./odeme-tipi-secici";
import { bakiyeHareketiEkle } from "./actions";

export function BakiyeHareketiEkleButonu({ hastaId }: { hastaId: string }) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<OdemeYontemi>("nakit");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const eklemeAction = bakiyeHareketiEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setOdemeTipi("nakit");
      setAciklamaMetni("");
    }
  }

  // Ödeme yöntemi (nakit/kredi kartı/havale) hasta_bakiye_hareket'te ayrı bir
  // kolon değil — açıklamaya etiket olarak ekleniyor, yeni migration gerekmedi.
  const birlesikAciklama = aciklamaMetni.trim()
    ? `${ODEME_TIPI_ETIKETLERI[odemeTipi]} — ${aciklamaMetni.trim()}`
    : ODEME_TIPI_ETIKETLERI[odemeTipi];

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ODEME_TIPI_SECILI_SINIFI}
        onClick={() => setAcik(true)}
      >
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tur" value="odeme" />
            <input type="hidden" name="aciklama" value={birlesikAciklama} />

            <div className="flex flex-col gap-1">
              <Label>Ödeme Tipi</Label>
              <OdemeTipiSecici value={odemeTipi} onChange={setOdemeTipi} disabled={isPending} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺)</Label>
              <Input
                id={`${idOnEki}-tutar`}
                name="tutar"
                type="number"
                min={0}
                step="0.01"
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input
                id={`${idOnEki}-aciklama`}
                value={aciklamaMetni}
                onChange={(e) => setAciklamaMetni(e.target.value)}
                disabled={isPending}
              />
            </div>

            {durum && (
              <p
                role="alert"
                className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
