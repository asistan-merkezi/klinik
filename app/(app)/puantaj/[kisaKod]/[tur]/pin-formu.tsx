"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/datetime";
import { puantajPinIleKaydet } from "./actions";

export function PinFormu({ klinikId, tur }: { klinikId: string; tur: "giris" | "cikis" }) {
  const [durum, formAction, isPending] = useActionState(puantajPinIleKaydet, null);
  const [pin, setPin] = useState("");

  if (durum?.success) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p role="status" className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
          {durum.message}
        </p>
        {durum.adSoyad && (
          <p className="text-sm text-muted-foreground">
            {durum.adSoyad}
            {durum.saat ? ` · ${formatTime(durum.saat)}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="klinik_id" value={klinikId} />
      <input type="hidden" name="tur" value={tur} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="pin">Puantaj PIN&apos;iniz</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          required
          disabled={isPending}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center text-2xl tracking-[0.5em]"
        />
      </div>

      {durum && !durum.success && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending || pin.length !== 6} className="w-full">
        {isPending ? "Kaydediliyor..." : tur === "giris" ? "Giriş Yap" : "Çıkış Yap"}
      </Button>
    </form>
  );
}
