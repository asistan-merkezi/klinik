"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { formatDateForInput } from "@/lib/datetime";
import type { SecenekSatir } from "@/types/randevu";
import { randevuOlustur } from "./actions";
import { HastaArama } from "./hasta-arama";

type Props = {
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  /** Randevu başarıyla oluşturulunca çağrılır (örn. dialog'u kapatmak için) */
  onBasarili?: () => void;
  /** Hasta Detay sayfasından açılınca hasta sabit gelir, arama alanı yerine salt-okunur gösterilir */
  sabitHasta?: { id: string; ad: string };
  /**
   * Bekleyen Randevu Talepleri'nden "Randevu Oluştur" ile açılınca dolar —
   * hasta/tedavi/tarih/saat hastanın talebiyle önceden doldurulur, gizli bir
   * talep_id input'u eklenir (randevuOlustur başarılı olunca ilgili
   * randevu_talebi satırını da onaylanmış olarak işaretler).
   */
  talep?: { id: string; hastaId: string; hastaAd: string; islemTanimiId: string; tarih: string; saat?: string };
};

export function RandevuFormu({
  hastalar,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
  onBasarili,
  sabitHasta,
  talep,
}: Props) {
  const efektifSabitHasta = sabitHasta ?? (talep ? { id: talep.hastaId, ad: talep.hastaAd } : undefined);
  const [durum, formAction, isPending] = useActionState(randevuOlustur, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  // React 19'da form action'ı başarıyla tamamlanınca native alanlar otomatik
  // sıfırlanıyor (HastaArama'nın kendi state'i bundan habersiz kalıp
  // görünüm/gizli-input uyumsuzluğu yaratıyor) — kafa karıştırıcı yarı-sıfırlanmış
  // form yerine, randevu detay panelindeki (düzenleme) ile aynı desenle dialog'u kapatıyoruz.
  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onBasarili?.();
    }
  }

  const searchParams = useSearchParams();
  const bugun = formatDateForInput(new Date().toISOString());
  // Günün Çizelgesi'nde boş alana tıklanınca oda/tarih/saat buradan gelir;
  // talep prop'u varsa (Bekleyen Randevu Talepleri'nden açılan form) hastanın
  // tercihi öncelikli.
  const onOdaId = searchParams.get("oda_id") ?? undefined;
  const onTarih = talep?.tarih ?? searchParams.get("tarih") ?? bugun;
  const onSaat = talep?.saat ?? searchParams.get("saat") ?? undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {talep && <input type="hidden" name="talep_id" value={talep.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="hasta_arama">Hasta</Label>
          {efektifSabitHasta ? (
            <>
              <Input value={efektifSabitHasta.ad} disabled readOnly />
              <input type="hidden" name="hasta_id" value={efektifSabitHasta.id} />
            </>
          ) : (
            <HastaArama id="hasta_arama" hastalar={hastalar} required disabled={isPending} />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending}
            items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="terapist_id" className="w-full">
              <SelectValue placeholder="Dr / Terapist seçin" />
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="oda_id">Oda</Label>
          <Select
            name="oda_id"
            required
            disabled={isPending}
            defaultValue={onOdaId}
            items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="oda_id" className="w-full">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="islem_tanimi_id">Tedavi</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            defaultValue={talep?.islemTanimiId}
            items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="islem_tanimi_id" className="w-full">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="cihaz_id">Cihaz (opsiyonel)</Label>
          <Select
            name="cihaz_id"
            disabled={isPending || cihazlar.length === 0}
            items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
          >
            <SelectTrigger id="cihaz_id" className="w-full">
              <SelectValue
                placeholder={cihazlar.length === 0 ? "Kayıtlı cihaz yok" : "Cihaz seçin"}
              />
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="tarih">Tarih</Label>
          <Input
            id="tarih"
            name="tarih"
            type="date"
            defaultValue={onTarih}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="saat">Saat</Label>
          <Input id="saat" name="saat" type="time" defaultValue={onSaat} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="sure_dakika">Süre (dakika)</Label>
          <Input
            id="sure_dakika"
            name="sure_dakika"
            type="number"
            min={5}
            max={480}
            defaultValue={30}
            required
            disabled={isPending}
          />
        </div>
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
        {isPending ? "Kaydediliyor..." : "Randevu oluştur"}
      </Button>
    </form>
  );
}
