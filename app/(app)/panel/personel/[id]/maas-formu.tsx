"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonelDetay, TerapistAyarlari } from "@/types/personel";
import { maasAyarlariGuncelle } from "./actions";

export function MaasFormu({
  personel,
  terapist,
}: {
  personel: PersonelDetay;
  terapist: TerapistAyarlari;
}) {
  const guncelleAction = maasAyarlariGuncelle.bind(null, personel.id, terapist.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const primUsulu = personel.calisma_tipi === "prim_usulu";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="maas">Sabit Maaş (₺)</Label>
          <Input
            id="maas"
            name="maas"
            type="number"
            min={0}
            step="0.01"
            defaultValue={personel.maas ?? ""}
            disabled={isPending}
          />
        </div>

        {primUsulu && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="prim_sabit_tutar">İşlem Başı Prim (₺/seans)</Label>
            <Input
              id="prim_sabit_tutar"
              name="prim_sabit_tutar"
              type="number"
              min={0}
              step="0.01"
              defaultValue={terapist.prim_sabit_tutar ?? ""}
              disabled={isPending}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Hesaplama şekli İş Bilgileri&apos;ndeki Çalışma Tipi&apos;ne göre belirlenir — &quot;Prim Usulü&quot; seçiliyse seans başı prim, aksi halde sabit maaş uygulanır.
      </p>

      {durum && (
        <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : "Ayarları kaydet"}
      </Button>
    </form>
  );
}
