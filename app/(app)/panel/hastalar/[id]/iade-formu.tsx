"use client";

import { bugunIstanbulTarihi } from "@/lib/datetime";
import { useActionState, useId, useState } from "react";
import { Undo2 } from "lucide-react";
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
import { OdemeTipiSecici, ODEME_TIPI_ETIKETLERI } from "./odeme-tipi-secici";
import { hastaIadesiVer } from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function HastaIadesiButonu({
  hastaId,
  hastaAdSoyad,
  bankaHesaplari,
  guncelBakiye,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  bankaHesaplari: KlinikBankaHesabi[];
  guncelBakiye: number;
}) {
  const idOnEki = useId();
  const [acik, setAcik] = useState(false);
  const [odemeTipi, setOdemeTipi] = useState<OdemeYontemi>("nakit");
  const [aciklamaMetni, setAciklamaMetni] = useState("");
  const [tutarMetni, setTutarMetni] = useState("");
  const [bankaHesapId, setBankaHesapId] = useState<string | undefined>(undefined);
  const [durum, formAction, isPending] = useActionState(hastaIadesiVer.bind(null, hastaId), null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setOdemeTipi("nakit");
      setAciklamaMetni("");
      setTutarMetni("");
      setBankaHesapId(undefined);
    }
  }

  // Ödeme Ekle'deki gibi yöntem hem kolona (odeme_yontemi) hem okunabilirlik
  // için açıklama metnine etiket olarak yazılıyor.
  const etiketOnEki = `${ODEME_TIPI_ETIKETLERI[odemeTipi]} iadesi`;
  const birlesikAciklama = aciklamaMetni.trim() ? `${etiketOnEki} — ${aciklamaMetni.trim()}` : etiketOnEki;

  const tutar = Number(tutarMetni) || 0;
  const iadeSonrasiBakiye = guncelBakiye - tutar;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        <Undo2 />
        İade Ver
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İade Ver</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">{hastaAdSoyad}</p>
          <p
            className={`text-sm font-medium tabular-nums ${
              guncelBakiye < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            Güncel Bakiye: {paraFormat(guncelBakiye)}
          </p>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="aciklama" value={birlesikAciklama} />
            <input type="hidden" name="odeme_yontemi" value={odemeTipi} />
            <input
              type="hidden"
              name="banka_hesap_id"
              value={odemeTipi === "banka_havalesi" ? (bankaHesapId ?? "") : ""}
            />

            <div className="flex flex-col gap-1">
              <Label>İade Yöntemi</Label>
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
                value={tutarMetni}
                onChange={(e) => setTutarMetni(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${idOnEki}-tarih`}>Tarih</Label>
              <Input
                id={`${idOnEki}-tarih`}
                name="tarih"
                type="date"
                defaultValue={bugunIstanbulTarihi()}
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

            {tutar > 0 && (
              <div className="flex flex-col gap-1 rounded-2xl border border-border p-3 text-sm">
                <div className="flex justify-between font-medium">
                  <span>İade Sonrası Bakiye</span>
                  <span
                    className={`tabular-nums ${iadeSonrasiBakiye < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}
                  >
                    {paraFormat(iadeSonrasiBakiye)}
                  </span>
                </div>
                {iadeSonrasiBakiye < 0 && guncelBakiye >= 0 && (
                  <p className="text-xs text-muted-foreground">
                    İade tutarı hastanın mevcut alacağından fazla — bakiye borca düşecek.
                  </p>
                )}
              </div>
            )}

            {durum && (
              <p
                role="alert"
                className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "İadeyi Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
