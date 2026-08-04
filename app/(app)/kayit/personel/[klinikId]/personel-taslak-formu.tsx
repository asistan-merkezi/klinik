"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { personelBasvuruTaslagiOlustur } from "./actions";

export function PersonelTaslakFormu({ klinikId }: { klinikId: string }) {
  const [durum, formAction, isPending] = useActionState(personelBasvuruTaslagiOlustur, null);
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="eposta">E-posta (opsiyonel)</Label>
        <Input id="eposta" name="eposta" type="email" disabled={isPending} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="basvurulan_gorev">Başvurulan Görev (opsiyonel)</Label>
        <Input id="basvurulan_gorev" name="basvurulan_gorev" placeholder="Örn. Fizyoterapist" disabled={isPending} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dogum_tarihi">Doğum Tarihi (opsiyonel)</Label>
        <Input id="dogum_tarihi" name="dogum_tarihi" type="date" disabled={isPending} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mesaj">Mesaj (opsiyonel)</Label>
        <textarea
          id="mesaj"
          name="mesaj"
          rows={3}
          disabled={isPending}
          className="flex w-full rounded-lg border border-input bg-input-bg px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Bu form bir hesap açmaz — başvurunuz klinik yönetimi tarafından onaylandıktan sonra size ayrıca
        haber verilecektir.
      </p>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Gönderiliyor..." : "Başvurumu Gönder"}
      </Button>
    </form>
  );
}
