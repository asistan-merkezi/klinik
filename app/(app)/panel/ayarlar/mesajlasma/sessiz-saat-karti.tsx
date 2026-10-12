"use client";

import { useId, useState, useTransition } from "react";
import { MoonStar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sessizSaatKaydet } from "./actions";

export function SessizSaatKarti({
  baslangicAktif,
  baslangicSaati,
  bitisSaati,
}: {
  baslangicAktif: boolean;
  baslangicSaati: string;
  bitisSaati: string;
}) {
  const id = useId();
  const [aktif, setAktif] = useState(baslangicAktif);
  const [baslangic, setBaslangic] = useState(baslangicSaati);
  const [bitis, setBitis] = useState(bitisSaati);
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);
  const [bekliyor, startTransition] = useTransition();

  const kaydet = () => {
    setSonuc(null);
    startTransition(async () => {
      setSonuc(await sessizSaatKaydet(!aktif, baslangic, bitis));
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <MoonStar className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Sessiz Saat</span>
            <p className="text-xs text-muted-foreground">
              Bu saatler arasında üretilen mesajlar bekletilir, aralık bitince gönderilir. Randevu iptal/erteleme bildirimleri
              zamana duyarlı olduğu için sessiz saatten muaftır. Randevuya çok yakın hatırlatmalar (ertelenince geç kalacak olanlar)
              hiç gönderilmez.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${id}-aktif`} className="font-normal">
              {aktif ? "Açık" : "Kapalı"}
            </Label>
            <Switch id={`${id}-aktif`} checked={aktif} onCheckedChange={setAktif} disabled={bekliyor} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-baslangic`}>Başlangıç</Label>
            <Input
              id={`${id}-baslangic`}
              type="time"
              value={baslangic}
              onChange={(e) => setBaslangic(e.target.value)}
              disabled={!aktif || bekliyor}
              className="w-32 tabular"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-bitis`}>Bitiş</Label>
            <Input
              id={`${id}-bitis`}
              type="time"
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              disabled={!aktif || bekliyor}
              className="w-32 tabular"
            />
          </div>
          <Button type="button" size="sm" onClick={kaydet} disabled={bekliyor}>
            {bekliyor ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>

        {sonuc && (
          <p className={sonuc.success ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-destructive"} role="status">
            {sonuc.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
