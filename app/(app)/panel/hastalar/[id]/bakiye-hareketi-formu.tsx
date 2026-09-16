"use client";

import { useActionState, useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OdemeYontemi } from "@/types/odeme";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { OdemeTipiSecici, ODEME_TIPI_ETIKETLERI, ODEME_TIPI_SECILI_SINIFI } from "./odeme-tipi-secici";
import { bakiyeHareketiEkle } from "./actions";

export function BakiyeHareketiEkleButonu({
  hastaId,
  bankaHesaplari,
}: {
  hastaId: string;
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<OdemeYontemi>("nakit");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [bankaHesapId, setBankaHesapId] = useState<string | undefined>(undefined);
  const eklemeAction = bakiyeHareketiEkle.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setOdemeTipi("nakit");
      setAciklamaMetni("");
      setBankaHesapId(undefined);
    }
  }

  // Ödeme yöntemi (nakit/kredi kartı/havale) hem yapılandırılmış odeme_yontemi
  // kolonuna hem (geriye dönük görünürlük için) açıklama metnine etiket
  // olarak ekleniyor (bkz. supabase/migrations/20260916091000).
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
            <input type="hidden" name="odeme_yontemi" value={odemeTipi} />
            <input
              type="hidden"
              name="banka_hesap_id"
              value={odemeTipi === "banka_havalesi" ? (bankaHesapId ?? "") : ""}
            />

            <div className="flex flex-col gap-1">
              <Label>Ödeme Tipi</Label>
              <OdemeTipiSecici
                value={odemeTipi}
                onChange={(deger) => {
                  setOdemeTipi(deger);
                  if (deger !== "banka_havalesi") setBankaHesapId(undefined);
                }}
                disabled={isPending}
              />
            </div>

            {odemeTipi === "banka_havalesi" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
                {bankaHesaplari.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                  </p>
                ) : (
                  <Select
                    disabled={isPending}
                    value={bankaHesapId}
                    onValueChange={(v) => setBankaHesapId(v ?? undefined)}
                    items={bankaHesaplari.map((b) => ({
                      value: b.id,
                      label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi,
                    }))}
                  >
                    <SelectTrigger id={`${idOnEki}-banka_hesap_id`} className="w-full">
                      <SelectValue placeholder="Seçiniz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankaHesaplari.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

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
