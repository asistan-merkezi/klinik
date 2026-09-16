"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { PERSONEL_ODEME_TIPI_ETIKET, type PersonelOdemeTipi } from "@/types/hesap-hareket";
import { hesapHareketiEkle } from "./actions";

type OdemeKategori = "odeme" | "avans";

const KATEGORI_ETIKET: Record<OdemeKategori, string> = {
  odeme: "Ödeme",
  avans: "Avans",
};

const ODEME_TIPI_SECILI_SINIFI =
  "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90";

export function OdemeEkleButonu({
  personelId,
  guncelBakiye,
  bankaHesaplari,
}: {
  personelId: string;
  guncelBakiye: number;
  bankaHesaplari: KlinikBankaHesabi[];
}) {
  const idOnEki = "odeme-ekle";
  const [acik, setAcik] = useState(false);
  const eklemeAction = hesapHareketiEkle.bind(null, personelId);
  const [durum, formAction, isPending] = useActionState(eklemeAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [kategori, setKategori] = useState<OdemeKategori>("odeme");
  const [tutar, setTutar] = useState(String(Math.max(0, guncelBakiye)));
  const [odemeTipi, setOdemeTipi] = useState<PersonelOdemeTipi | null>(null);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setAcik(false);
      setKategori("odeme");
      setTutar(String(Math.max(0, guncelBakiye)));
      setOdemeTipi(null);
    }
  }

  function kategoriSec(deger: OdemeKategori) {
    setKategori(deger);
    // Sadece "Ödeme" seçilince güncel bakiye öneri olarak dolduruluyor —
    // avans miktarı keyfi olduğu için orada öneri yok. Kullanıcı istediği
    // zaman elle değiştirebilir, bu sadece başlangıç değeri.
    setTutar(deger === "odeme" ? String(Math.max(0, guncelBakiye)) : "");
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAcik(true)}>
        <Plus />
        Ödeme Ekle
      </Button>
      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ödeme Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="tur" value={kategori} />
            <input type="hidden" name="odeme_tipi" value={odemeTipi ?? ""} />

            <div className="flex flex-col gap-1">
              <Label>Kategori</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(KATEGORI_ETIKET) as OdemeKategori[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    className={cn(kategori === k && ODEME_TIPI_SECILI_SINIFI)}
                    onClick={() => kategoriSec(k)}
                  >
                    {KATEGORI_ETIKET[k]}
                  </Button>
                ))}
              </div>
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
                value={tutar}
                onChange={(e) => setTutar(e.target.value)}
              />
              {kategori === "odeme" && (
                <p className="text-xs text-muted-foreground">Güncel bakiye önerisi — istersen değiştir.</p>
              )}
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
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${idOnEki}-banka_hesap_id`}>Banka Hesabı</Label>
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
              <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
              <Input id={`${idOnEki}-aciklama`} name="aciklama" disabled={isPending} />
            </div>

            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
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
