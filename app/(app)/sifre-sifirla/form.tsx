"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sifreSifirlaEylemi } from "./actions";

export function SifreSifirlaFormu({ jeton }: { jeton: string }) {
  const [durum, formAction, isPending] = useActionState(sifreSifirlaEylemi, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jeton" value={jeton} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="yeni_sifre">Yeni şifre</Label>
        <Input id="yeni_sifre" name="yeni_sifre" type="password" autoComplete="new-password" minLength={10} required disabled={isPending} />
        <p className="text-xs text-muted-foreground">En az 10 karakter, en az bir harf ve bir rakam.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="yeni_sifre_tekrar">Yeni şifre (tekrar)</Label>
        <Input id="yeni_sifre_tekrar" name="yeni_sifre_tekrar" type="password" autoComplete="new-password" minLength={10} required disabled={isPending} />
      </div>
      {durum?.success === false && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Kaydediliyor..." : "Şifreyi kaydet"}
      </Button>
    </form>
  );
}
