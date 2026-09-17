"use client";

import { useActionState, useState } from "react";
import { FileHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { manuelRaporEkle } from "./actions";

type PersonelSecenek = { id: string; ad_soyad: string; gorev: string };

/** Raporlu günler için ayrı bir talep akışı yok — yönetici bu ekrandan doğrudan Puantaj Cetveli'ne "raporlu" satırları yazar. */
export function ManuelRaporEkleDialog({ personelListesi }: { personelListesi: PersonelSecenek[] }) {
  const [acik, setAcik] = useState(false);
  const [durum, formAction, isPending] = useActionState(manuelRaporEkle, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setAcik(false);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAcik(true)}>
        <FileHeart /> Manuel Rapor Ekle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manuel Rapor Ekle</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="manuel-rapor-personel">Personel</Label>
              <Select name="personel_id" required disabled={isPending} items={personelListesi.map((p) => ({ value: p.id, label: `${p.ad_soyad} · ${p.gorev}` }))}>
                <SelectTrigger id="manuel-rapor-personel" className="w-full">
                  <SelectValue placeholder="Personel seçin" />
                </SelectTrigger>
                <SelectContent>
                  {personelListesi.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.ad_soyad} · {p.gorev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="manuel-rapor-baslangic">Başlangıç</Label>
                <Input id="manuel-rapor-baslangic" name="baslangic_tarih" type="date" required disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="manuel-rapor-bitis">Bitiş</Label>
                <Input id="manuel-rapor-bitis" name="bitis_tarih" type="date" required disabled={isPending} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="manuel-rapor-not">Not (opsiyonel)</Label>
              <Input id="manuel-rapor-not" name="not_metni" disabled={isPending} placeholder="Örn. doktor raporu no." />
            </div>

            <p className="text-xs text-muted-foreground">
              Hafta tatili ve resmi tatil günleri otomatik atlanır. Onaylı bir izin talebiyle çakışan günler
              işlenmez.
            </p>

            {durum && (
              <p role="alert" className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Ekleniyor..." : "Raporu Ekle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
