"use client";

import { useActionState } from "react";
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
import type { SecenekSatir } from "@/types/randevu";
import { HAFTANIN_GUNLERI } from "@/types/periyodik-randevu";
import { periyodikRandevuOlustur } from "./actions";
import { HastaArama } from "./hasta-arama";

type Props = {
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
};

export function PeriyodikRandevuFormu({ hastalar, terapistler, odalar, cihazlar, tedaviler }: Props) {
  const [durum, formAction, isPending] = useActionState(periyodikRandevuOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Seçilen haftanın günü + saatinde ileriye dönük 5 aylık randevu tek seferde oluşturulur. Bir
        haftanın saati doluysa o hafta atlanır ve hastaya WhatsApp'tan saat değişikliği için mesaj linki
        hazırlanır. Süre bitimine 2 hafta kala Hasta Detay sayfasında uyarı çıkar; oradan uzatılabilir,
        gün/saati değiştirilebilir veya iptal edilebilir.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_hasta_arama">Hasta</Label>
          <HastaArama id="periyodik_hasta_arama" hastalar={hastalar} required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_terapist_id">Dr / Terapist</Label>
          <Select
            name="terapist_id"
            required
            disabled={isPending}
            items={terapistler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="periyodik_terapist_id" className="w-full">
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
          <Label htmlFor="periyodik_oda_id">Oda</Label>
          <Select
            name="oda_id"
            required
            disabled={isPending}
            items={odalar.map((o) => ({ value: o.id, label: o.ad }))}
          >
            <SelectTrigger id="periyodik_oda_id" className="w-full">
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
          <Label htmlFor="periyodik_islem_tanimi_id">Tedavi</Label>
          <Select
            name="islem_tanimi_id"
            required
            disabled={isPending}
            items={tedaviler.map((t) => ({ value: t.id, label: t.ad }))}
          >
            <SelectTrigger id="periyodik_islem_tanimi_id" className="w-full">
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
          <Label htmlFor="periyodik_cihaz_id">Cihaz (opsiyonel)</Label>
          <Select
            name="cihaz_id"
            disabled={isPending || cihazlar.length === 0}
            items={cihazlar.map((c) => ({ value: c.id, label: c.ad }))}
          >
            <SelectTrigger id="periyodik_cihaz_id" className="w-full">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_haftanin_gunu">Haftanın Günü</Label>
          <Select
            name="haftanin_gunu"
            required
            disabled={isPending}
            defaultValue="1"
            items={HAFTANIN_GUNLERI}
          >
            <SelectTrigger id="periyodik_haftanin_gunu" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HAFTANIN_GUNLERI.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_saat">Saat</Label>
          <Input id="periyodik_saat" name="saat" type="time" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="periyodik_sure_dakika">Süre (dakika)</Label>
          <Input
            id="periyodik_sure_dakika"
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
        <div className="flex flex-col gap-2">
          <p
            role="alert"
            className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
          >
            {durum.message}
          </p>
          {durum.cakismalar && durum.cakismalar.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
              {durum.cakismalar.map((c) => (
                <li key={c.tarihEtiketi} className="flex items-center justify-between gap-2">
                  <span>{c.tarihEtiketi}</span>
                  <a
                    href={c.whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-emerald-700 underline dark:text-emerald-400"
                  >
                    WhatsApp'tan Gönder
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Oluşturuluyor..." : "Periyodik randevu oluştur"}
      </Button>
    </form>
  );
}
