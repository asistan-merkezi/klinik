"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateForInput, formatTimeForInput } from "@/lib/datetime";
import type { RandevuDurum, RandevuSatir } from "@/types/randevu";
import { randevuGelisIsaretle, randevuDurumGuncelle, randevuErtele, randevuSeansiTamamla } from "./actions";

type Sonuc = { success: boolean; message: string } | null;
type AcikForm = "gecikmeli" | "ertelendi" | "tamamla" | null;

// Çizelgedeki kutucuk renkleriyle aynı (bkz. randevu-kutusu.tsx): geldi/gecikmeli
// yeşil, gelmedi/iptal kırmızı, ertelendi açık mavi.
const AKTIF_SINIFI: Partial<Record<RandevuDurum, string>> = {
  geldi: "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-500/90",
  gecikmeli_geldi: "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-500/90",
  gelmedi: "border-destructive bg-destructive text-white hover:bg-destructive/90",
  iptal: "border-destructive bg-destructive text-white hover:bg-destructive/90",
  ertelendi: "border-sky-500 bg-sky-500 text-white hover:bg-sky-600 dark:hover:bg-sky-500/90",
  tamamlandi: "border-violet-500 bg-violet-500 text-white hover:bg-violet-600 dark:hover:bg-violet-500/90",
};

/**
 * Randevu sonucu için 5 seçenek (Geldi/Gecikmeli Geldi/Gelmedi/Ertelendi/
 * İptal) — kullanıcı kararıyla randevunun MEVCUT durumu ne olursa olsun
 * hepsi her zaman tıklanabilir (yanlış işaretlemeler serbestçe düzeltilsin).
 * Panel açıldığında hiçbiri "seçili" görünmez (bilinçli — mevcut durumu
 * vurgulayan bir varsayılan yok); ama bir seçenek tıklanıp işlem BAŞARIYLA
 * uygulandığında o buton, tıklandığı belli olsun diye çizelgedeki kutucukla
 * aynı renge boyanıyor (yeşil/kırmızı/açık mavi) — kullanıcı isteği.
 */
export function DurumButonlari({ randevu }: { randevu: RandevuSatir }) {
  const [isPending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const [acikForm, setAcikForm] = useState<AcikForm>(null);
  const [secilenDurum, setSecilenDurum] = useState<RandevuDurum | null>(null);
  const [gecikmeDakika, setGecikmeDakika] = useState("15");
  const [ertelemeTarih, setErtelemeTarih] = useState(() => formatDateForInput(randevu.baslangic));
  const [ertelemeSaat, setErtelemeSaat] = useState(() => formatTimeForInput(randevu.baslangic));
  const [tamamlaAciklama, setTamamlaAciklama] = useState("");

  function calistir(hedefDurum: RandevuDurum, eylem: () => Promise<Sonuc>) {
    startTransition(async () => {
      const r = await eylem();
      setSonuc(r);
      setAcikForm(null);
      if (r?.success) {
        setSecilenDurum(hedefDurum);
      }
    });
  }

  function butonSinifi(durum: RandevuDurum) {
    return secilenDurum === durum ? AKTIF_SINIFI[durum] : undefined;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("geldi"))}
          onClick={() => calistir("geldi", () => randevuGelisIsaretle(randevu.id, null))}
        >
          Geldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("gecikmeli_geldi"))}
          onClick={() => setAcikForm((f) => (f === "gecikmeli" ? null : "gecikmeli"))}
        >
          Gecikmeli Geldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("gelmedi"))}
          onClick={() => calistir("gelmedi", () => randevuDurumGuncelle(randevu.id, "gelmedi"))}
        >
          Gelmedi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("ertelendi"))}
          onClick={() => setAcikForm((f) => (f === "ertelendi" ? null : "ertelendi"))}
        >
          Ertelendi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("iptal"))}
          onClick={() => calistir("iptal", () => randevuDurumGuncelle(randevu.id, "iptal"))}
        >
          İptal
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className={cn(butonSinifi("tamamlandi"))}
          onClick={() => setAcikForm((f) => (f === "tamamla" ? null : "tamamla"))}
        >
          Seansı Bitir
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
            onClick={() =>
              calistir("gecikmeli_geldi", () => randevuGelisIsaretle(randevu.id, Number(gecikmeDakika)))
            }
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
              calistir("ertelendi", () => {
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

      {acikForm === "tamamla" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <Label htmlFor="tamamla_aciklama">İşlem Açıklaması</Label>
          <textarea
            id="tamamla_aciklama"
            value={tamamlaAciklama}
            onChange={(e) => setTamamlaAciklama(e.target.value)}
            rows={2}
            required
            disabled={isPending}
            placeholder="Bu seansta yapılan işlemi kısaca açıklayın..."
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={isPending || !tamamlaAciklama.trim()}
            onClick={() =>
              calistir("tamamlandi", () => randevuSeansiTamamla(randevu.id, tamamlaAciklama.trim()))
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
