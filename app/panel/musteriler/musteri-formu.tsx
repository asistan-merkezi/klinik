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
import { musteriOlustur } from "./actions";

const KIMLIK_TIPI_SECENEKLERI = [
  { value: "tc", label: "T.C. Kimlik No" },
  { value: "pasaport", label: "Pasaport No" },
];

export function MusteriFormu() {
  const [durum, formAction, isPending] = useActionState(musteriOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500">
        Hızlı kayıt — sadece temel bilgiler. Adres, acil durum kişisi ve sağlık geçmişi müşteri
        portalından veya Müşteri Detay sayfasından sonra eklenebilir.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad_soyad">Ad Soyad</Label>
          <Input id="ad_soyad" name="ad_soyad" required disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input id="telefon" name="telefon" type="tel" placeholder="05xx xxx xx xx" required disabled={isPending} />
        </div>

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
          <Label htmlFor="kimlik_no">Kimlik No</Label>
          <Input id="kimlik_no" name="kimlik_no" disabled={isPending} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dogum_tarihi">Doğum Tarihi (opsiyonel)</Label>
          <Input id="dogum_tarihi" name="dogum_tarihi" type="date" disabled={isPending} />
        </div>

        <div className="flex flex-col justify-end gap-2 pb-2">
          <div className="flex items-center gap-2">
            <input
              id="whatsapp_izin_durumu"
              name="whatsapp_izin_durumu"
              type="checkbox"
              disabled={isPending}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Label htmlFor="whatsapp_izin_durumu" className="font-normal">
              WhatsApp bildirimlerine izin veriyor
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="ticari_ileti_onay"
              name="ticari_ileti_onay"
              type="checkbox"
              disabled={isPending}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Label htmlFor="ticari_ileti_onay" className="font-normal">
              Kampanya/bilgilendirme (SMS-e-posta) almak istiyor
            </Label>
          </div>
        </div>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600" : "text-red-600"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Müşteri ekle"}
      </Button>
    </form>
  );
}
