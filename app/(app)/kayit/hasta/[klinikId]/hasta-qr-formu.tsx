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
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { hastaQrKayitOlustur } from "./actions";

const KIMLIK_TIPI_SECENEKLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

export function HastaQrFormu({ klinikId }: { klinikId: string }) {
  const [durum, formAction, isPending] = useActionState(hastaQrKayitOlustur, null);
  const [adSoyad, setAdSoyad] = useState("");

  if (durum?.success) {
    return (
      <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
        {durum.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="klinik_id" value={klinikId} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="ad_soyad">Ad Soyad</Label>
        <Input
          id="ad_soyad"
          name="ad_soyad"
          value={adSoyad}
          onChange={(e) => setAdSoyad(isimBasHarfBuyukYap(e.target.value))}
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="telefon">Telefon</Label>
        <Input id="telefon" name="telefon" type="tel" placeholder="05xx xxx xx xx" required disabled={isPending} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="kimlik_no_tipi">Kimlik Türü</Label>
          <Select name="kimlik_no_tipi" disabled={isPending} defaultValue="tc" items={KIMLIK_TIPI_SECENEKLERI}>
            <SelectTrigger id="kimlik_no_tipi" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIMLIK_TIPI_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="kimlik_no">Kimlik No (opsiyonel)</Label>
          <Input id="kimlik_no" name="kimlik_no" disabled={isPending} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dogum_tarihi">Doğum Tarihi (opsiyonel)</Label>
        <Input id="dogum_tarihi" name="dogum_tarihi" type="date" disabled={isPending} />
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-start gap-2">
          <input
            id="whatsapp_izin_durumu"
            name="whatsapp_izin_durumu"
            type="checkbox"
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <Label htmlFor="whatsapp_izin_durumu" className="font-normal">
            WhatsApp bildirimlerine (randevu, paket durumu) izin veriyorum
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="ticari_ileti_onay"
            name="ticari_ileti_onay"
            type="checkbox"
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <Label htmlFor="ticari_ileti_onay" className="font-normal">
            Kampanya/bilgilendirme (SMS-e-posta) almak istiyorum
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="kvkk_onay"
            name="kvkk_onay"
            type="checkbox"
            required
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <Label htmlFor="kvkk_onay" className="font-normal">
            KVKK Aydınlatma Metni&apos;ni okudum, kişisel verilerimin klinik tarafından işlenmesini
            onaylıyorum. (Zorunlu)
          </Label>
        </div>
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Kaydediliyor..." : "Kaydımı Oluştur"}
      </Button>
    </form>
  );
}
