"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sifreDegistirEylemi } from "./actions";

export function SifreDegistirFormu() {
  const [durum, formAction, isPending] = useActionState(sifreDegistirEylemi, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="mevcut_sifre">Mevcut (geçici) şifre</Label>
        <Input id="mevcut_sifre" name="mevcut_sifre" type="password" autoComplete="current-password" required disabled={isPending} />
      </div>
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
        {isPending ? "Kaydediliyor..." : "Şifreyi değiştir"}
      </Button>
    </form>
  );
}
