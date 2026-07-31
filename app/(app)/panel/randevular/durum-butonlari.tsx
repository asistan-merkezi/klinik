"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateForInput, formatTimeForInput } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";
import { randevuGelisIsaretle, randevuDurumGuncelle, randevuErtele } from "./actions";

type Sonuc = { success: boolean; message: string } | null;
type AcikForm = "gecikmeli" | "ertelendi" | null;

/**
 * Randevu sonucu için 5 seçenek (Geldi/Gecikmeli Geldi/Gelmedi/Ertelendi/
 * İptal) — kullanıcı kararıyla randevunun MEVCUT durumu ne olursa olsun
 * hepsi her zaman tıklanabilir (yanlış işaretlemeler serbestçe düzeltilsin),
 * ve hiçbiri "seçili/işaretli" görünmez — bilinçli olarak hepsi eşit ağırlıkta
 * (outline) buton, mevcut durumu vurgulayan bir aktif/checked stil yok.
 */
export function DurumButonlari({ randevu }: { randevu: RandevuSatir }) {
  const [isPending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const [acikForm, setAcikForm] = useState<AcikForm>(null);
  const [gecikmeDakika, setGecikmeDakika] = useState("15");
  const [ertelemeTarih, setErtelemeTarih] = useState(() => formatDateForInput(randevu.baslangic));
  const [ertelemeSaat, setErtelemeSaat] = useState(() => formatTimeForInput(randevu.baslangic));

  function calistir(eylem: () => Promise<Sonuc>) {
    startTransition(async () => {
      const r = await eylem();
      setSonuc(r);
      setAcikForm(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => calistir(() => randevuGelisIsaretle(randevu.id, null))}
        >
          Geldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setAcikForm((f) => (f === "gecikmeli" ? null : "gecikmeli"))}
        >
          Gecikmeli Geldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => calistir(() => randevuDurumGuncelle(randevu.id, "gelmedi"))}
        >
          Gelmedi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setAcikForm((f) => (f === "ertelendi" ? null : "ertelendi"))}
        >
          Ertelendi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => calistir(() => randevuDurumGuncelle(randevu.id, "iptal"))}
        >
          İptal
        </Button>
      </div>

      {acikForm === "gecikmeli" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="gecikme_dakika">Gecikme (dk)</Label>
            <Input
              id="gecikme_dakika"
              type="number"
              min={1}
              value={gecikmeDakika}
              onChange={(e) => setGecikmeDakika(e.target.value)}
              className="w-24"
              disabled={isPending}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !gecikmeDakika || Number(gecikmeDakika) <= 0}
            onClick={() => calistir(() => randevuGelisIsaretle(randevu.id, Number(gecikmeDakika)))}
          >
            Kaydet
          </Button>
        </div>
      )}

      {acikForm === "ertelendi" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="erteleme_tarih">Yeni tarih</Label>
            <Input
              id="erteleme_tarih"
              type="date"
              value={ertelemeTarih}
              onChange={(e) => setErtelemeTarih(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="erteleme_saat">Yeni saat</Label>
            <Input
              id="erteleme_saat"
              type="time"
              value={ertelemeSaat}
              onChange={(e) => setErtelemeSaat(e.target.value)}
              disabled={isPending}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !ertelemeTarih || !ertelemeSaat}
            onClick={() =>
              calistir(() => {
                const formData = new FormData();
                formData.set("tarih", ertelemeTarih);
                formData.set("saat", ertelemeSaat);
                return randevuErtele(randevu.id, formData);
              })
            }
          >
            Kaydet
          </Button>
        </div>
      )}

      {sonuc && (
        <p role="alert" className={sonuc.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
          {sonuc.message}
        </p>
      )}
    </div>
  );
}
