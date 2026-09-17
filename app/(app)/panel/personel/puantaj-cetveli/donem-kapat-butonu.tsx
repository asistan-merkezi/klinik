"use client";

import { useState, useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saatEtiket } from "@/lib/puantaj";
import type { AyOzeti } from "@/lib/puantaj";
import type { HakedisSonucu } from "@/lib/personel/hakedis";
import { donemKapat, donemYenidenAc } from "./actions";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function DonemKapatButonu({
  personelId,
  yil,
  ay,
  ayEtiket,
  ozet,
  hakedis,
}: {
  personelId: string;
  yil: number;
  ay: number;
  ayEtiket: string;
  ozet: AyOzeti;
  hakedis: HakedisSonucu;
}) {
  const [acik, setAcik] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  function kapat() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await donemKapat(personelId, yil, ay);
      if (sonuc?.success) {
        setAcik(false);
      } else {
        setHata(sonuc?.message ?? "Dönem kapatılamadı.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAcik(true)}>
        <Lock /> Dönemi Kapat
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{ayEtiket} dönemini kapat</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Kapatıldıktan sonra bu ay için giriş/çıkış düzenlenemez — yeniden düzenlemek için önce
            &quot;Dönemi Yeniden Aç&quot; gerekir. Onaylı fazla mesai varsa Ödemeler&apos;e otomatik hakediş satırı eklenir.
          </p>

          <dl className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Net çalışma</dt>
              <dd>{saatEtiket(ozet.netDakika / 60)} sa</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Onaylı fazla mesai</dt>
              <dd>{saatEtiket(ozet.onayliFmDakika / 60)} sa</dd>
            </div>
            {ozet.bekleyenFmDakika > 0 && (
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                <dt>Onay bekleyen FM (dahil edilmeyecek)</dt>
                <dd>{saatEtiket(ozet.bekleyenFmDakika / 60)} sa</dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Eksik çalışma</dt>
              <dd>{saatEtiket(ozet.eksikDakika / 60)} sa</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">İzin günü</dt>
              <dd>{ozet.izinGun}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Devamsızlık günü</dt>
              <dd>{ozet.devamsizlikGun}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1 font-medium">
              <dt>Yazılacak hakediş</dt>
              <dd>{paraFormat(hakedis.toplam)}</dd>
            </div>
          </dl>

          {hakedis.taban === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Taban hakediş ₺0 görünüyor — personelin maaşı girilmemiş olabilir. Kapatıldıktan sonra bu
              satır DEĞİŞTİRİLEMEZ (yeniden açılsa bile eski satır silinmez, düzeltme elle yeni bir
              hareketle yapılmalı) — devam etmeden önce Maaş Ayarları&apos;nı kontrol edin.
            </p>
          )}

          {hata && (
            <p role="alert" className="text-sm text-destructive">
              {hata}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAcik(false)} disabled={isPending}>
              Vazgeç
            </Button>
            <Button type="button" onClick={kapat} disabled={isPending}>
              {isPending ? "Kapatılıyor..." : "Dönemi Kapat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DonemYenidenAcButonu({ personelId, yil, ay }: { personelId: string; yil: number; ay: number }) {
  const [isPending, startTransition] = useTransition();

  function ac() {
    startTransition(async () => {
      await donemYenidenAc(personelId, yil, ay);
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={ac} disabled={isPending}>
      <LockOpen /> {isPending ? "Açılıyor..." : "Dönemi Yeniden Aç"}
    </Button>
  );
}
