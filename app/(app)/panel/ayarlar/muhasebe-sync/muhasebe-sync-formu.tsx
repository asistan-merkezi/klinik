"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MuhasebeEntegrasyonDurum } from "@/types/muhasebe-entegrasyon";
import { muhasebeSyncGuncelle } from "./actions";

export function MuhasebeSyncFormu({ durum }: { durum: MuhasebeEntegrasyonDurum | null }) {
  const [sonuc, formAction, isPending] = useActionState(muhasebeSyncGuncelle, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Bu bilgiler yalnızca Supabase&apos;te (RLS ile izole, disk seviyesinde şifreli) saklanır ve
        sadece Muhasebe Sync tarafından kullanılır. Client Secret kaydedildikten sonra bir daha
        ekranda gösterilmez — değiştirmek istemediğinizde alanı boş bırakabilirsiniz.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="parasut_client_id">Client ID</Label>
          <Input
            id="parasut_client_id"
            name="parasut_client_id"
            required
            disabled={isPending}
            defaultValue={durum?.parasut_client_id ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="parasut_company_id">Şirket (Company) ID</Label>
          <Input
            id="parasut_company_id"
            name="parasut_company_id"
            required
            disabled={isPending}
            defaultValue={durum?.parasut_company_id ?? ""}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="parasut_client_secret">Client Secret</Label>
          <Input
            id="parasut_client_secret"
            name="parasut_client_secret"
            type="password"
            autoComplete="off"
            disabled={isPending}
            placeholder={
              durum?.baglanti_durumu === "baglandi" ? "•••••••• (değiştirmek için yeni değer girin)" : ""
            }
          />
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
