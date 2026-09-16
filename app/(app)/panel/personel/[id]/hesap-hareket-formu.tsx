"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KlinikBankaHesabi } from "@/types/klinik";
import {
  MANUEL_HESAP_HAREKET_SECENEKLERI,
  ODEME_TIPI_GOSTERILEN_TURLER,
  PERSONEL_ODEME_TIPI_ETIKET,
  type ManuelHesapHareketTuru,
  type PersonelOdemeTipi,
} from "@/types/hesap-hareket";
import { hesapHareketiEkle } from "./actions";

const ODEME_TIPI_SECILI_SINIFI =
  "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

export function HesapHareketFormu({
  personelId,
  bankaHesaplari,
}: {
  personelId: string;
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const eklemeAction = hesapHareketiEkle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [tur, setTur] = useState<ManuelHesapHareketTuru>("prim");
  const [odemeTipi, setOdemeTipi] = useState<PersonelOdemeTipi | null>(null);
  const odemeTipiGosterilir = ODEME_TIPI_GOSTERILEN_TURLER.includes(tur);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <input type="hidden" name="odeme_tipi" value={odemeTipiGosterilir ? (odemeTipi ?? "") : ""} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tur">Tür</Label>
          <Select
            name="tur"
            required
            disabled={isPending}
            value={tur}
            onValueChange={(v) => setTur(v as ManuelHesapHareketTuru)}
            items={MANUEL_HESAP_HAREKET_SECENEKLERI}
          >
            <SelectTrigger id="tur" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUEL_HESAP_HAREKET_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="tutar">Tutar (₺)</Label>
          <Input id="tutar" name="tutar" type="number" min={0} step="0.01" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="aciklama">Açıklama</Label>
          <Input id="aciklama" name="aciklama" disabled={isPending} />
        </div>
      </div>

      {odemeTipiGosterilir && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label>Ödeme Tipi (opsiyonel — Kasa/Banka mutabakatı için)</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PERSONEL_ODEME_TIPI_ETIKET) as PersonelOdemeTipi[]).map((tip) => (
                <Button
                  key={tip}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className={cn(odemeTipi === tip && ODEME_TIPI_SECILI_SINIFI)}
                  onClick={() => setOdemeTipi((onceki) => (onceki === tip ? null : tip))}
                >
                  {PERSONEL_ODEME_TIPI_ETIKET[tip]}
                </Button>
              ))}
            </div>
          </div>

          {odemeTipi === "havale" && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="banka_hesap_id">Banka Hesabı</Label>
              {bankaHesaplari.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Kayıtlı banka hesabı yok — Finans &gt; Banka&apos;dan hesap ekleyin.
                </p>
              ) : (
                <Select
                  name="banka_hesap_id"
                  disabled={isPending}
                  items={bankaHesaplari.map((b) => ({
                    value: b.id,
                    label: b.sube ? `${b.banka_adi} — ${b.sube}` : b.banka_adi,
                  }))}
                >
                  <SelectTrigger id="banka_hesap_id" className="w-full">
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
        </div>
      )}

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" size="sm" disabled={isPending} className="w-fit">
        {isPending ? "Ekleniyor..." : "Ödeme Ekle"}
      </Button>
    </form>
  );
}
