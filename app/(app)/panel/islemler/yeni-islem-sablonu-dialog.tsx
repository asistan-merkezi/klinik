"use client";

import { useActionState, useState } from "react";
import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SecenekSatir } from "@/types/randevu";
import { islemAdimiSablonuOlustur } from "./actions";

export function YeniIslemSablonuDialog({ pozisyonlar }: { pozisyonlar: SecenekSatir[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(islemAdimiSablonuOlustur, null);
  const [formKey, setFormKey] = useState(0);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setFormKey((k) => k + 1);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAcik(true)}>
        <CirclePlus /> İşlem Tanımlama
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni İşlem Tanımlama</DialogTitle>
          </DialogHeader>
          <form key={formKey} action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sablon-ad">İşlem Adı</Label>
              <Input id="sablon-ad" name="ad" required disabled={isPending} placeholder="Ör. TENS" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sablon-pozisyon">Uygulayacak Kişi (opsiyonel)</Label>
              <Select
                name="uygulayici_pozisyon_id"
                disabled={isPending || pozisyonlar.length === 0}
                items={pozisyonlar.map((p) => ({ value: p.id, label: p.ad }))}
              >
                <SelectTrigger id="sablon-pozisyon" className="w-full">
                  <SelectValue placeholder={pozisyonlar.length === 0 ? "Kayıtlı pozisyon yok" : "Pozisyon seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {pozisyonlar.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.ad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="sablon-sure">Süre (dk, opsiyonel)</Label>
              <Input
                id="sablon-sure"
                name="sure_dakika"
                type="number"
                min={1}
                max={480}
                disabled={isPending}
              />
            </div>

            {durum && (
              <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
