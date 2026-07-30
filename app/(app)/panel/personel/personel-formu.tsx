"use client";

import { useActionState } from "react";
import { AdresSecici } from "@/components/ui/AdresSecici";
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
import { ROL_SECENEKLERI } from "@/types/personel";
import { personelHesabiOlustur } from "./actions";

export function PersonelFormu() {
  const [durum, formAction, isPending] = useActionState(personelHesabiOlustur, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ad_soyad">Ad Soyad</Label>
          <Input id="ad_soyad" name="ad_soyad" required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tc_kimlik_no">T.C. Kimlik No</Label>
          <Input id="tc_kimlik_no" name="tc_kimlik_no" inputMode="numeric" maxLength={11} disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="eposta">Kurumsal E-posta</Label>
          <Input id="eposta" name="eposta" type="email" required disabled={isPending} placeholder="ornek@klinik.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gsm">GSM Numarası</Label>
          <Input id="gsm" name="gsm" required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="unvan">Unvan / Branş</Label>
          <Input id="unvan" name="unvan" required disabled={isPending} placeholder="Fizyoterapist, Resepsiyon..." />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="uzmanlik_tescil_no">Uzmanlık / Diploma / Tescil No</Label>
          <Input id="uzmanlik_tescil_no" name="uzmanlik_tescil_no" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="rol">Rol</Label>
          <Select name="rol" disabled={isPending} defaultValue="terapist" items={ROL_SECENEKLERI}>
            <SelectTrigger id="rol" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROL_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Adres (opsiyonel)</legend>
          <AdresSecici prefix="adres" disabled={isPending} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="adres">Sokak / Cadde, Bina No, Daire</Label>
            <textarea
              id="adres"
              name="adres"
              rows={2}
              disabled={isPending}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </fieldset>
      </div>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
          {durum.geciciSifre && (
            <>
              {" "}
              Geçici şifre: <span className="font-mono font-semibold">{durum.geciciSifre}</span> — personele
              iletin, bir daha gösterilmeyecek.
            </>
          )}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Oluşturuluyor..." : "Personel hesabı oluştur"}
      </Button>
    </form>
  );
}
