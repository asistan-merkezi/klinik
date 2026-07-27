"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SirketBilgileri } from "@/types/klinik";
import { sirketBilgileriGuncelle } from "./actions";

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SirketBilgileriFormu({ bilgiler }: { bilgiler: SirketBilgileri | null }) {
  const [sonuc, formAction, isPending] = useActionState(sirketBilgileriGuncelle, null);
  const [onizleme, setOnizleme] = useState<string | null>(null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {onizleme || bilgiler?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={onizleme ?? bilgiler?.logo_url ?? ""}
              alt="Klinik logosu"
              className="size-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">Logo yok</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="logo">Logo (PNG/JPG/WEBP/SVG, en fazla 2 MB)</Label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={isPending}
            onChange={(e) => {
              const dosya = e.target.files?.[0];
              setOnizleme(dosya ? URL.createObjectURL(dosya) : null);
            }}
            className="text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="unvan">Şirket Ünvanı</Label>
          <Input id="unvan" name="unvan" disabled={isPending} defaultValue={bilgiler?.unvan ?? ""} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="adres">Adres</Label>
          <textarea
            id="adres"
            name="adres"
            rows={2}
            disabled={isPending}
            defaultValue={bilgiler?.adres ?? ""}
            className={textareaClass}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="vergi_dairesi">Vergi Dairesi</Label>
          <Input id="vergi_dairesi" name="vergi_dairesi" disabled={isPending} defaultValue={bilgiler?.vergi_dairesi ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="vergi_no">Vergi Numarası</Label>
          <Input id="vergi_no" name="vergi_no" disabled={isPending} defaultValue={bilgiler?.vergi_no ?? ""} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input id="telefon" name="telefon" disabled={isPending} defaultValue={bilgiler?.telefon ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="whatsapp_no">WhatsApp Numarası</Label>
          <Input id="whatsapp_no" name="whatsapp_no" disabled={isPending} defaultValue={bilgiler?.whatsapp_no ?? ""} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="eposta">E-posta</Label>
          <Input id="eposta" name="eposta" type="email" disabled={isPending} defaultValue={bilgiler?.eposta ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="yetkili_kisi">Yetkili Kişi</Label>
          <Input id="yetkili_kisi" name="yetkili_kisi" disabled={isPending} defaultValue={bilgiler?.yetkili_kisi ?? ""} />
        </div>
      </div>

      {sonuc && (
        <p role="alert" className={`text-sm ${sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {sonuc.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </form>
  );
}
