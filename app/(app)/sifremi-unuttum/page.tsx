"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sifremiUnuttumEylemi } from "./actions";

export default function SifremiUnuttumSayfasi() {
  const [durum, formAction, isPending] = useActionState(sifremiUnuttumEylemi, null);
  return (
    <div className="dark flex flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Şifremi unuttum</CardTitle>
          <CardDescription>Personel hesabınızın e-posta adresini girin. Hasta portalı şifreleri için kliniğinize başvurun.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="eposta">E-posta</Label>
              <Input id="eposta" name="eposta" type="email" autoComplete="email" required disabled={isPending} />
            </div>
            {durum && (
              <p role="status" className="text-sm text-muted-foreground">
                {durum.mesaj}
              </p>
            )}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Gönderiliyor..." : "Bağlantı gönder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
