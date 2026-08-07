"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/datetime";
import { gunEtiket, saatKisalt } from "@/lib/puantaj";
import { PUANTAJ_DURUM_SECENEKLERI } from "@/types/puantaj";
import type { PersonelPuantajSatir } from "@/types/puantaj";
import { gunKaydet } from "./actions";

const OTOMATIK_DEGER = "otomatik";
const DURUM_SECENEKLERI_OTOMATIK = [
  { value: OTOMATIK_DEGER, label: "Otomatik (izinden tespit et)" },
  ...PUANTAJ_DURUM_SECENEKLERI,
];

export function GunDuzenleDialog({
  personelId,
  tarih,
  kayit,
  planlanan,
}: {
  personelId: string;
  tarih: string;
  kayit: PersonelPuantajSatir | null;
  planlanan: { baslangic: string; bitis: string } | null;
}) {
  const [acik, setAcik] = useState(false);
  const kaydetAction = gunKaydet.bind(null, personelId, tarih);
  const [durum, formAction, isPending] = useActionState(kaydetAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) setAcik(false);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAcik(true)}>
        {kayit ? (
          <>
            <Pencil /> Düzenle
          </>
        ) : (
          <>
            <Plus /> Ekle
          </>
        )}
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{gunEtiket(tarih)}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Planlanan:{" "}
            {planlanan
              ? `${saatKisalt(planlanan.baslangic)}–${saatKisalt(planlanan.bitis)}`
              : "vardiya ataması yok"}
          </p>

          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="giris_saat">Giriş Saati</Label>
                <Input
                  id="giris_saat"
                  name="giris_saat"
                  type="time"
                  disabled={isPending}
                  defaultValue={kayit?.giris_saat ? formatTime(kayit.giris_saat) : ""}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cikis_saat">Çıkış Saati</Label>
                <Input
                  id="cikis_saat"
                  name="cikis_saat"
                  type="time"
                  disabled={isPending}
                  defaultValue={kayit?.cikis_saat ? formatTime(kayit.cikis_saat) : ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="mola_dakika">Mola (dakika)</Label>
                <Input
                  id="mola_dakika"
                  name="mola_dakika"
                  type="number"
                  min={0}
                  disabled={isPending}
                  defaultValue={kayit?.mola_dakika ?? 0}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="durum">Durum</Label>
                <Select
                  name="durum"
                  disabled={isPending}
                  defaultValue={kayit?.durum ?? OTOMATIK_DEGER}
                  items={DURUM_SECENEKLERI_OTOMATIK}
                >
                  <SelectTrigger id="durum" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURUM_SECENEKLERI_OTOMATIK.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="not_metni">Not</Label>
              <textarea
                id="not_metni"
                name="not_metni"
                rows={2}
                disabled={isPending}
                defaultValue={kayit?.not_metni ?? ""}
                className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>

            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
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
