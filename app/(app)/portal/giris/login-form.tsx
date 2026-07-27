"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalGirisYap } from "./actions";

export function PortalLoginForm() {
  const [durum, formAction, isPending] = useActionState(portalGirisYap, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="telefon">Telefon</Label>
        <Input
          id="telefon"
          name="telefon"
          type="tel"
          autoComplete="tel"
          required
          disabled={isPending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sifre">Şifre</Label>
        <Input
          id="sifre"
          name="sifre"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>
      {durum?.success === false && (
        <p role="alert" className="text-sm text-destructive">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Giriş yapılıyor..." : "Giriş yap"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Portal erişiminiz yoksa kliniğinizle iletişime geçin.
      </p>
    </form>
  );
}
