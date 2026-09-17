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

  return (
    <form action={formAction} className="flex flex-col gap-4">
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

      <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
        <legend className="mb-1 text-sm font-medium">Prim</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="prim_sabit_tutar">Prim (₺/seans)</Label>
          <Input
            id="prim_sabit_tutar"
            name="prim_sabit_tutar"
            type="number"
            min={0}
            step="0.01"
            defaultValue={terapist.prim_sabit_tutar ?? ""}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Doldurulursa, sabit maaşa ek olarak o ay tamamlanan her seans için bu tutar hakedişe eklenir —
            Çalışma Tipi ne olursa olsun.
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
        <legend className="mb-1 text-sm font-medium">Fazla Mesai</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fm_saatlik_ucret">Fazla Mesai Ücreti (₺/saat)</Label>
          <Input
            id="fm_saatlik_ucret"
            name="fm_saatlik_ucret"
            type="number"
            min={0}
            step="0.01"
            defaultValue={personel.fm_saatlik_ucret ?? ""}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Puantaj Cetveli&apos;nde onaylanan fazla mesai saatleri bu saatlik ücretle çarpılıp hakedişe eklenir.
          </p>
        </div>
      </fieldset>

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
