"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaasHesaplamaModeli, PersonelDetay, TerapistAyarlari } from "@/types/personel";
import { maasAyarlariGuncelle } from "./actions";

const MODEL_SECENEKLERI: { value: MaasHesaplamaModeli; label: string }[] = [
  { value: "sabit", label: "Sabit maaş" },
  { value: "islem_basi_prim", label: "İşlem başı prim (sabit ₺)" },
  { value: "barajli_prim", label: "Barajlı prim (bonus)" },
];

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

        <div className="flex flex-col gap-2">
          <Label htmlFor="maas_gecerlilik_tarihi">Geçerlilik Tarihi</Label>
          <Input
            id="maas_gecerlilik_tarihi"
            name="maas_gecerlilik_tarihi"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="maas_hesaplama_modeli">Hesaplama Modeli</Label>
          <Select
            name="maas_hesaplama_modeli"
            required
            disabled={isPending}
            defaultValue={terapist.maas_hesaplama_modeli}
            items={MODEL_SECENEKLERI}
          >
            <SelectTrigger id="maas_hesaplama_modeli" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_SECENEKLERI.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="flex flex-col gap-2">
          <Label htmlFor="baraj_seans_sayisi">Baraj (seans sayısı)</Label>
          <Input
            id="baraj_seans_sayisi"
            name="baraj_seans_sayisi"
            type="number"
            min={1}
            step="1"
            defaultValue={terapist.baraj_seans_sayisi ?? ""}
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="baraj_bonus_tutari">Baraj Üstü Bonus (₺)</Label>
          <Input
            id="baraj_bonus_tutari"
            name="baraj_bonus_tutari"
            type="number"
            min={0}
            step="0.01"
            defaultValue={terapist.baraj_bonus_tutari ?? ""}
            disabled={isPending}
          />
        </div>
      </div>

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
