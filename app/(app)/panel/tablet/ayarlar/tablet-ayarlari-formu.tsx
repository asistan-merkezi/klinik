"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TabletAyarlari } from "@/types/tablet-ayarlari";
import { tabletAyarlariGuncelle } from "./actions";

const SECENEKLER: {
  anahtar: keyof TabletAyarlari;
  etiket: string;
  aciklama?: string;
}[] = [
  { anahtar: "hasta_adi_goster", etiket: "Hasta Adı" },
  { anahtar: "terapist_adi_goster", etiket: "Terapist Adı" },
  { anahtar: "islem_adi_goster", etiket: "İşlem Adı" },
  {
    anahtar: "durum_rengi_goster",
    etiket: "Oda Durumu Renk Kodu",
    aciklama: "Kırmızı: Meşgul, Yeşil: Müsait",
  },
];

export function TabletAyarlariFormu({
  durumlar,
  onDegisiklik,
}: {
  durumlar: TabletAyarlari;
  onDegisiklik: (anahtar: keyof TabletAyarlari, deger: boolean) => void;
}) {
  const [durum, formAction, isPending] = useActionState(tabletAyarlariGuncelle, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gösterilecek Bilgiler</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {SECENEKLER.map((secenek) => (
              <div key={secenek.anahtar} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    id={secenek.anahtar}
                    name={secenek.anahtar}
                    type="checkbox"
                    checked={durumlar[secenek.anahtar]}
                    onChange={(e) => onDegisiklik(secenek.anahtar, e.target.checked)}
                    disabled={isPending}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={secenek.anahtar} className="font-normal">
                    {secenek.etiket}
                  </Label>
                </div>
                {secenek.aciklama && (
                  <span className="pl-6 text-xs text-muted-foreground">{secenek.aciklama}</span>
                )}
              </div>
            ))}
          </div>

          {durum && (
            <p
              role="alert"
              className={`text-sm ${
                durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              }`}
            >
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
