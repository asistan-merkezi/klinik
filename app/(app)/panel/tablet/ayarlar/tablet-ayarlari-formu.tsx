"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TabletAyarlari, TabletTemasi } from "@/types/tablet-ayarlari";
import { tabletAyarlariGuncelle } from "./actions";

const SECENEKLER: {
  anahtar: keyof Omit<TabletAyarlari, "tema">;
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

const TEMA_SECENEKLERI: { deger: TabletTemasi; etiket: string }[] = [
  { deger: "acik", etiket: "Açık" },
  { deger: "koyu", etiket: "Koyu" },
];

export function TabletAyarlariFormu({
  durumlar,
  onDegisiklik,
  onTemaDegisiklik,
}: {
  durumlar: TabletAyarlari;
  onDegisiklik: (anahtar: keyof Omit<TabletAyarlari, "tema">, deger: boolean) => void;
  onTemaDegisiklik: (tema: TabletTemasi) => void;
}) {
  const [durum, formAction, isPending] = useActionState(tabletAyarlariGuncelle, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gösterilecek Bilgiler</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label className="font-normal">Tablet Teması</Label>
            <div className="flex gap-3">
              {TEMA_SECENEKLERI.map((secenek) => (
                <label
                  key={secenek.deger}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 transition-colors",
                    durumlar.tema === secenek.deger ? "border-primary" : "border-border"
                  )}
                >
                  <input
                    type="radio"
                    name="tema"
                    value={secenek.deger}
                    checked={durumlar.tema === secenek.deger}
                    onChange={() => onTemaDegisiklik(secenek.deger)}
                    disabled={isPending}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      secenek.deger === "koyu" && "dark",
                      "flex h-14 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background"
                    )}
                  >
                    <span className="h-1.5 w-10 rounded-full bg-foreground/70" />
                    <span className="h-1.5 w-6 rounded-full bg-muted-foreground/50" />
                  </div>
                  <span className="text-xs font-medium">{secenek.etiket}</span>
                </label>
              ))}
            </div>
          </div>

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
