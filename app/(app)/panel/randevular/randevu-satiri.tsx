"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
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
import { formatDateForInput, formatDateTime, formatTimeForInput } from "@/lib/datetime";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { randevuGuncelle } from "./actions";
import { DurumButonlari } from "./durum-butonlari";
import { HastaArama } from "./hasta-arama";

const DURUM_ETIKET: Record<RandevuSatir["durum"], string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  iptal: "İptal",
  gelmedi: "Gelmedi",
};

function sureDakika(baslangic: string, bitis: string) {
  return Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 60_000);
}

export function RandevuSatiri({
  randevu,
  hastalar,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  randevu: RandevuSatir;
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const guncelleAction = randevuGuncelle.bind(null, randevu.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  if (duzenleniyor) {
    return (
      <li className="py-3">
        <form action={formAction} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`hasta-${randevu.id}`}>Hasta</Label>
              <HastaArama
                id={`hasta-${randevu.id}`}
                hastalar={hastalar}
                varsayilanId={randevu.hasta_id}
                varsayilanAd={randevu.hasta?.ad_soyad}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`terapist-${randevu.id}`}>Terapist</Label>
              <Select
                name="terapist_id"
                required
                disabled={isPending}
                defaultValue={randevu.terapist_id}
                items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
              >
                <SelectTrigger id={`terapist-${randevu.id}`} className="w-full">
                  <SelectValue placeholder="Terapist seçin" />
                </SelectTrigger>
                <SelectContent>
                  {terapistler.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`oda-${randevu.id}`}>Oda</Label>
              <Select
                name="oda_id"
                required
                disabled={isPending}
                defaultValue={randevu.oda_id}
                items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
              >
                <SelectTrigger id={`oda-${randevu.id}`} className="w-full">
                  <SelectValue placeholder="Oda seçin" />
                </SelectTrigger>
                <SelectContent>
                  {odalar.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`tedavi-${randevu.id}`}>Tedavi</Label>
              <Select
                name="islem_tanimi_id"
                required
                disabled={isPending}
                defaultValue={randevu.islem_tanimi?.id}
                items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
              >
                <SelectTrigger id={`tedavi-${randevu.id}`} className="w-full">
                  <SelectValue placeholder="Tedavi seçin" />
                </SelectTrigger>
                <SelectContent>
                  {tedaviler.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`cihaz-${randevu.id}`}>Cihaz (opsiyonel)</Label>
              <Select
                name="cihaz_id"
                disabled={isPending || cihazlar.length === 0}
                defaultValue={randevu.cihaz_id ?? undefined}
                items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
              >
                <SelectTrigger id={`cihaz-${randevu.id}`} className="w-full">
                  <SelectValue placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {cihazlar.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`tarih-${randevu.id}`}>Tarih</Label>
              <Input
                id={`tarih-${randevu.id}`}
                name="tarih"
                type="date"
                defaultValue={formatDateForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`saat-${randevu.id}`}>Saat</Label>
              <Input
                id={`saat-${randevu.id}`}
                name="saat"
                type="time"
                defaultValue={formatTimeForInput(randevu.baslangic)}
                required
                disabled={isPending}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`sure-${randevu.id}`}>Süre (dakika)</Label>
              <Input
                id={`sure-${randevu.id}`}
                name="sure_dakika"
                type="number"
                min={5}
                max={480}
                defaultValue={sureDakika(randevu.baslangic, randevu.bitis)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {durum.message}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setDuzenleniyor(false)}
            >
              Vazgeç
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{randevu.hasta?.ad_soyad ?? "—"}</span>
        <span className="text-muted-foreground">
          {randevu.terapist?.personel?.ad_soyad ?? "—"} · {randevu.oda?.ad ?? "—"}
          {randevu.islem_tanimi?.ad ? ` · ${randevu.islem_tanimi.ad}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">Randevu: {formatDateTime(randevu.baslangic)}</span>
        {randevu.created_at && (
          <span className="text-xs text-muted-foreground">
            Oluşturma: {formatDateTime(randevu.created_at)}
            {randevu.olusturan_kullanici?.ad_soyad ? ` · ${randevu.olusturan_kullanici.ad_soyad}` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
        <span className="text-muted-foreground">{DURUM_ETIKET[randevu.durum]}</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Randevuyu düzenle"
            onClick={() => setDuzenleniyor(true)}
          >
            <Pencil />
          </Button>
          <DurumButonlari randevuId={randevu.id} durum={randevu.durum} />
        </div>
      </div>
    </li>
  );
}
