"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SatilabilirUrun, OdemeYontemi } from "@/types/odeme";
import { YONTEM_ETIKETLERI } from "@/types/odeme";
import { odemeAl } from "./actions";

type KalemSatiri = {
  tur: "islem" | "paket";
  refId: string;
  ad: string;
  birimFiyat: number;
  miktar: number;
};

type OdemeSatirSatiri = {
  yontem: OdemeYontemi;
  tutar: number;
};

const paraFormatla = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function OdemeFormu({
  hastaId,
  urunler,
}: {
  hastaId: string;
  urunler: SatilabilirUrun[];
}) {
  const odemeAlAction = odemeAl.bind(null, hastaId);
  const [durum, formAction, isPending] = useActionState(odemeAlAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  const [kalemler, setKalemler] = useState<KalemSatiri[]>([]);
  const [satirlar, setSatirlar] = useState<OdemeSatirSatiri[]>([]);
  const [seciliUrun, setSeciliUrun] = useState<string | null>(null);
  const [iskonto, setIskonto] = useState(0);
  const [faturali, setFaturali] = useState(false);
  const [aciklama, setAciklama] = useState("");

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setKalemler([]);
      setSatirlar([]);
      setSeciliUrun(null);
      setIskonto(0);
      setFaturali(false);
      setAciklama("");
    }
  }

  const kalemToplam = kalemler.reduce((acc, k) => acc + k.birimFiyat * k.miktar, 0);
  const netToplam = Math.max(kalemToplam - iskonto, 0);
  const satirToplam = satirlar.reduce((acc, s) => acc + s.tutar, 0);
  const kalan = Math.round((netToplam - satirToplam) * 100) / 100;

  function urunEkle() {
    if (!seciliUrun) return;
    const [tur, refId] = seciliUrun.split(":") as ["islem" | "paket", string];
    const urun = urunler.find((u) => u.tur === tur && u.id === refId);
    if (!urun) return;

    setKalemler((onceki) => [
      ...onceki,
      { tur: urun.tur, refId: urun.id, ad: urun.ad, birimFiyat: urun.fiyat, miktar: 1 },
    ]);
    setSeciliUrun(null);
  }

  function kalemKaldir(index: number) {
    setKalemler((onceki) => onceki.filter((_, i) => i !== index));
  }

  function kalemMiktarGuncelle(index: number, miktar: number) {
    setKalemler((onceki) =>
      onceki.map((k, i) => (i === index ? { ...k, miktar: Math.max(miktar, 1) } : k))
    );
  }

  function satirEkle() {
    setSatirlar((onceki) => [
      ...onceki,
      { yontem: "nakit", tutar: kalan > 0 ? kalan : 0 },
    ]);
  }

  function satirKaldir(index: number) {
    setSatirlar((onceki) => onceki.filter((_, i) => i !== index));
  }

  function satirGuncelle(index: number, degisiklik: Partial<OdemeSatirSatiri>) {
    setSatirlar((onceki) => onceki.map((s, i) => (i === index ? { ...s, ...degisiklik } : s)));
  }

  const gonderilebilir = kalemler.length > 0 && satirlar.length > 0 && kalan === 0 && !isPending;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input
        type="hidden"
        name="kalemler_json"
        value={JSON.stringify(
          kalemler.map((k) => ({ tur: k.tur, ref_id: k.refId, miktar: k.miktar }))
        )}
      />
      <input
        type="hidden"
        name="satirlar_json"
        value={JSON.stringify(satirlar.map((s) => ({ yontem: s.yontem, tutar: s.tutar })))}
      />

      <div className="flex flex-col gap-2">
        <Label>Ürün Ekle</Label>
        <div className="flex gap-2">
          <Select
            value={seciliUrun}
            onValueChange={(deger) => setSeciliUrun(deger as string)}
            items={urunler.map((u) => ({
              value: `${u.tur}:${u.id}`,
              label: `${u.tur === "paket" ? "Paket" : "İşlem"}: ${u.ad} — ${paraFormatla(u.fiyat)}`,
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="İşlem veya paket seçin" />
            </SelectTrigger>
            <SelectContent>
              {urunler.map((u) => (
                <SelectItem key={`${u.tur}:${u.id}`} value={`${u.tur}:${u.id}`}>
                  {u.tur === "paket" ? "Paket" : "İşlem"}: {u.ad} — {paraFormatla(u.fiyat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={urunEkle} disabled={!seciliUrun}>
            Ekle
          </Button>
        </div>
      </div>

      {kalemler.length > 0 && (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {kalemler.map((k, index) => (
            <li key={index} className="flex items-center justify-between gap-2 py-2">
              <div className="flex flex-col">
                <span className="font-medium">
                  {k.tur === "paket" ? "Paket" : "İşlem"}: {k.ad}
                </span>
                <span className="text-muted-foreground">
                  {paraFormatla(k.birimFiyat)} × {k.miktar} = {paraFormatla(k.birimFiyat * k.miktar)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {k.tur === "islem" ? (
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    value={k.miktar}
                    onChange={(e) => kalemMiktarGuncelle(index, Number(e.target.value))}
                    className="w-16"
                  />
                ) : (
                  <span className="text-muted-foreground">1 adet</span>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => kalemKaldir(index)}>
                  Kaldır
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="iskonto_tutari">İskonto (₺)</Label>
          <Input
            id="iskonto_tutari"
            name="iskonto_tutari"
            type="number"
            min={0}
            step="0.01"
            value={iskonto}
            onChange={(e) => setIskonto(Number(e.target.value) || 0)}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="aciklama">Açıklama (opsiyonel)</Label>
          <Input
            id="aciklama"
            name="aciklama"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="faturali"
            name="faturali"
            type="checkbox"
            checked={faturali}
            onChange={(e) => setFaturali(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="faturali" className="font-normal">
            Faturalı
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
        <div className="flex justify-between">
          <span>Kalem toplamı</span>
          <span>{paraFormatla(kalemToplam)}</span>
        </div>
        <div className="flex justify-between">
          <span>İskonto</span>
          <span>-{paraFormatla(iskonto)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>Ödenecek tutar</span>
          <span>{paraFormatla(netToplam)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Ödeme Satırları</Label>
          <Button type="button" size="sm" variant="outline" onClick={satirEkle}>
            Satır ekle
          </Button>
        </div>

        {satirlar.length > 0 && (
          <ul className="flex flex-col gap-2">
            {satirlar.map((s, index) => (
              <li key={index} className="flex items-center gap-2">
                <Select
                  value={s.yontem}
                  onValueChange={(deger) => satirGuncelle(index, { yontem: deger as OdemeYontemi })}
                  items={Object.entries(YONTEM_ETIKETLERI).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(YONTEM_ETIKETLERI).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={s.tutar}
                  onChange={(e) => satirGuncelle(index, { tutar: Number(e.target.value) || 0 })}
                  className="w-28"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => satirKaldir(index)}>
                  Kaldır
                </Button>
              </li>
            ))}
          </ul>
        )}

        <p className={`text-sm ${kalan === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
          Kalan: {paraFormatla(kalan)}
        </p>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={!gonderilebilir} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ödemeyi kaydet"}
      </Button>
    </form>
  );
}
