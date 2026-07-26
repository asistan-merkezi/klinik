"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { girisYap } from "./actions";

export function LoginForm() {
  const [durum, formAction, isPending] = useActionState(girisYap, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="eposta">E-posta</Label>
        <Input
          id="eposta"
          name="eposta"
          type="email"
          autoComplete="email"
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
        <p role="alert" className="text-sm text-red-600">
          {durum.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Giriş yapılıyor..." : "Giriş yap"}
      </Button>
    </form>
  );
}
